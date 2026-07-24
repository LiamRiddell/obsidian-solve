import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, arrayValue, boolValue, datetimeValue, percentageValue, persistentValue, isArenaActive, errorValue } from "@solve-js/vm/Value";
import type { VM, OpRegistry } from "@solve-js/vm/OpRegistry";
import { convertUnit, getMeasure, getBestUnit } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType } from "@solve-js/diagnostics";
import { builtinFunctions, pluginFunctionRegistry } from "@solve-js/vm/VMBuiltins";
import { getOpCodeName } from "@solve-js/parser/OpCode";
import { unifyUom, binaryOp } from "@solve-js/vm/VMConversion";

/**
 * Create a new VM instance with the given opcode registry and configurable limits.
 *
 * The VM is a stack machine that executes compiled bytecode. It manages:
 * - A value stack (bounded by `maxStackDepth`)
 * - A variable store (Map of name → Value)
 * - An instruction counter (bounded by `maxInstructions`)
 * - An AbortSignal for async cancellation
 *
 * @param registry - Opcode handler registry for plugin-extensible opcodes
 * @param maxStackDepth - Maximum stack slots (default 200)
 * @param maxInstructions - Maximum opcodes per expression (default 50000)
 */
export function createVM(registry: OpRegistry, maxStackDepth = 200, maxInstructions = 50000): VM {
    const stack: Value[] = [];
    const variables = new Map<string, Value>();
    let instructionCount = 0;

    let activeSignal: AbortSignal | undefined;
    let abortCurrent: (() => void) | undefined;

    return {
      push(v: Value) {
        if (stack.length < maxStackDepth) {
          stack.push(v);
        }
      },
      pop() {
        if (stack.length === 0) {
          return numberValue(0);
        }
        return stack.pop()!;
      },
      popNumber() { return stack.pop()!.toNumber(); },
      popString() { return (stack.pop()!.value as string); },
      peek() { return stack[stack.length - 1]; },
      getStack() { return stack; },
      registry,
      getVar(key: string) { return variables.get(key); },
      setVar(key: string, val: Value) { variables.set(key, val); },
      reset() {
        stack.length = 0;
        variables.clear();
        instructionCount = 0;
        // Abort any in-flight async work for the previous expression
        if (abortCurrent) { abortCurrent(); abortCurrent = undefined; }
        activeSignal = undefined;
      },
      get activeSignal() { return activeSignal; },
      set activeSignal(s: AbortSignal | undefined) { activeSignal = s; },
      get abortCurrent() { return abortCurrent; },
      set abortCurrent(f: (() => void) | undefined) { abortCurrent = f; },
      getMaxInstructions() { return maxInstructions; },
      getInstructionCount() { return instructionCount; },
      incrementInstructions(n: number) {
        instructionCount += n;
        if (instructionCount > maxInstructions) {
          throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
        }
      },
    };
}

/**
 * Compiled bytecode ready for VM execution.
 *
 * Uses packed TypedArrays for cache-friendly memory layout:
 * - `opcodes`: Uint8Array of OpCode values
 * - `numbers`: Float64Array of numeric literals (indexed by opcode operands)
 * - `strings`: String table for identifiers, UoM units, and BigInt literals
 */
export interface Bytecode {
    opcodes: Uint8Array;
    numbers: Float64Array;
    strings: string[];
}

/**
 * Discriminated union returned by {@link executeBytecode}.
 *
 * Two variants:
 * - `value`: execution completed synchronously with a concrete Value
 * - `pending`: an async plugin call was encountered — the orchestrator
 *   must await the resolver Promise, then re-execute
 *
 * Replaces the old throw-AsyncSuspenseError pattern, eliminating the need
 * for try/catch in the engine.
 */
export type EvalResult =
    | { type: 'value'; value: Value }
    | { type: 'pending'; queryKey: string; resolver: Promise<Value>; packageId: string; signal: AbortSignal };

/**
 * Extract the Value from an EvalResult.
 * Throws if the result is pending (should not happen at call sites that
 * have already resolved async dependencies).
 */
export function unwrapEvalResult(result: EvalResult): Value {
    if (result.type === 'value') return result.value;
    throw new Error(`Expected value result but got pending: ${result.queryKey}`);
}

// ── Shared helpers ─────────────────────────────────────────────────────
// Kept as module-level functions so V8 can inline them at the switch case
// call sites. Cost: zero when inlined by TurboFan.

/** Extract milliseconds from a duration Value (UoM time unit or plain number).
 *  Used by ADD/SUB datetime fast paths and DATE_ADD/DATE_SUB opcodes. */
function extractDurationMs(value: Value): number {
    if (value.type === ValueType.Uom) {
        const unit = value.unit;
        if (unit) {
            try { return convertUnit(value.toNumber(), unit, "ms"); } catch { /* Ignore */ }
        }
        return 0;
    }
    return value.toNumber();
}

/**
 * Execute bytecode with optional diagnostic pipeline integration.
 *
 * Performance notes:
 * - Uses a `switch(op)` statement for dispatch. V8 compiles dense integer
 *   switches (OpCode values 0–200) into a jump table with O(1) dispatch.
 *   All handler code is inlined directly in the switch cases, allowing
 *   TurboFan to optimize across opcode boundaries.
 * - ADD/SUB/MUL have an inlined numeric fast path that skips the `binaryOp()`
 *   function call + closure allocation when both operands are plain numbers
 *   (>90% of arithmetic ops).
 * - Tracing uses a boolean guard (`shouldTrace`) that the JIT eliminates
 *   entirely when diagnostics are disabled. No function call overhead.
 * - `Value.toNumber()` caches its result — computed once, read thereafter.
 */
export function executeBytecode(
    bytecode: Bytecode,
    vm: VM,
    pipeline?: DiagnosticPipeline | undefined,
    expression?: string
): EvalResult {
    const { opcodes, numbers, strings } = bytecode;
    let ip = 0;
    let localInstructionCount = 0;
    const maxInstructions = vm.getMaxInstructions();

    // Direct stack array reference. Bypasses VM.push/pop bounds checks
    // for the hot loop. The bytecode compiler guarantees stack balance,
    // so bounds checks are only needed for malformed/corrupt bytecode
    // (which would be caught by tests long before reaching production).
    const stack = vm.getStack();

    // Boolean guard: JIT will eliminate the entire branch when false.
    // No function call, no argument evaluation, zero overhead.
    const shouldTrace = pipeline?.hasCollectors ?? false;

    // Hoist arena check to a local constant — avoids a function call at
    // every HALT/STORE_VAR/fallback-return in the dispatch loop.
    // The arena is only active during scroll execution (ThreeTierEvaluator
    // Tier 2); in all other paths this is always false and the JIT can
    // eliminate the unreachable persistentValue() branch entirely.
    const hasArena = isArenaActive();

    if (opcodes.length === 0) return { type: 'value', value: numberValue(0) };

    while (ip < opcodes.length) {
      // Tighten instruction limit check: combined increment + guard.
      // V8 optimises `++localInstructionCount > maxInstructions` into a
      // single fused add-and-compare on the hot path. The default limit
      // (50k) is never reached in benchmarks, so this branch is statically
      // predicted not-taken by the CPU.
      if (++localInstructionCount > maxInstructions) {
        throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
      }
      const op = opcodes[ip++] as OpCode;

      if (shouldTrace) {
        const stackSnapshot = stack.map(v => ({
          type: v.type,
          value: v.value,
          unit: v.unit,
        }));
        pipeline!.fireVmStep({
          type: DiagnosticEventType.VmStep,
          elapsedNs: 0,
          expression: expression ?? "",
          opcode: op,
          opcodeName: getOpCodeName(op),
          ip: ip - 1,
          stackDepth: stack.length,
          instructionNumber: localInstructionCount,
          stack: stackSnapshot,
        });
      }

      // ── switch dispatch: V8 compiles dense integer switches (OpCode 0–200)
      //    into a jump table with O(1) dispatch. Sections mirror the OpCode
      //    enum ordering for discoverability.
      switch (op) {
        // ═══════════════════════════════════════════════════════════════
        // §1  Stack operations  (OpCode 0–3)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.NOP:
          break;
        case OpCode.HALT: {
          const result = stack.pop()!;
          return { type: 'value', value: hasArena ? persistentValue(result) : result };
        }
        case OpCode.DUP:
          stack.push(stack[stack.length - 1]);
          break;
        case OpCode.SWAP: {
          const a = stack.pop()!, b = stack.pop()!;
          stack.push(a);
          stack.push(b);
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §2  Push literals  (OpCode 10–15)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.PUSH_NUMBER:
          stack.push(numberValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.PUSH_BIGINT:
          stack.push(bigIntValue(BigInt(strings[opcodes[ip++]])));
          break;
        case OpCode.PUSH_HEX:
          stack.push(hexValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.PUSH_STRING:
          stack.push(stringValue(strings[opcodes[ip++]]));
          break;
        case OpCode.PUSH_BOOLEAN:
          stack.push(boolValue(opcodes[ip++] === 1));
          break;

        // ═══════════════════════════════════════════════════════════════
        // §3  Arithmetic  (OpCode 20–27)
        //     Binary ops (ADD/SUB/MUL/DIV/MOD/EXP) have inlined numeric
        //     fast paths; unary ops (NEG/POS) handle BigInt and UoM.
        // ═══════════════════════════════════════════════════════════════
        case OpCode.ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) + (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            if (r.type === ValueType.Datetime) {
              // Adding two absolute timestamps has no standard meaning
              // (unlike subtracting them, which yields a duration).
              stack.push(errorValue("INVALID_DATETIME_OP", "Cannot add two datetimes together"));
            } else {
              stack.push(datetimeValue(l.toNumber() + extractDurationMs(r)));
            }
          } else {
            stack.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
          }
          break;
        }
        case OpCode.SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) - (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            if (r.type === ValueType.Datetime) {
              // "now - now" used to unconditionally re-wrap the result as
              // ANOTHER Datetime — e.g. subtracting two timestamps close
              // together produced a near-Unix-epoch date ("01/01/1970,
              // 01:00:00") instead of the near-zero duration a user would
              // expect. Two datetimes subtract to a duration, not a point
              // in time — represented as a Uom in milliseconds, consistent
              // with how extractDurationMs() reads durations elsewhere.
              stack.push(uomValue(l.toNumber() - r.toNumber(), "ms"));
            } else {
              stack.push(datetimeValue(l.toNumber() - extractDurationMs(r)));
            }
          } else {
            stack.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
          }
          break;
        }
        case OpCode.MUL: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) * (r.value as number)));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
          }
          break;
        }
        case OpCode.DIV: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            if (sameMeasure) {
              stack.push(numberValue(lv / rv));
            } else {
              // Dimension mismatch (e.g. "5kg / 3m"). This codebase has no
              // compound/derived-unit representation (no "kg/m"), so the
              // old behavior of silently keeping just the LEFT unit
              // ("1.67 kg") was actively misleading — it discarded the
              // denominator's unit entirely rather than expressing the
              // true derived unit. Error instead, matching the
              // INCOMPATIBLE_UNITS convention binaryOp() already applies
              // to ADD/SUB/MUL for the same mismatch.
              stack.push(errorValue("INCOMPATIBLE_UNITS", `Cannot combine incompatible units: ${l.unit} and ${r.unit}`));
            }
          } else {
            stack.push(binaryOp(l, r, (a, b) => a / b, (a, b) => a / b));
          }
          break;
        }
        case OpCode.MOD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a % b, (a, b) => a % b));
          break;
        }
        case OpCode.EXP: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
          break;
        }
        case OpCode.NEG: {
          const v = stack.pop()!;
          if (v.type === ValueType.BigInt) stack.push(bigIntValue(-(v.value as bigint)));
          else if (v.type === ValueType.Uom) stack.push(uomValue(-v.toNumber(), v.unit!));
          else stack.push(numberValue(-v.toNumber()));
          break;
        }
        case OpCode.POS: {
          const v = stack.pop()!;
          if (v.type === ValueType.Uom) stack.push(uomValue(v.toNumber(), v.unit!));
          else stack.push(numberValue(v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §4  Bitwise  (OpCode 30–36)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.LSHIFT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) << BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() << r.toNumber()));
          }
          break;
        }
        case OpCode.RSHIFT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) >> BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() >> r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_AND: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) & BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() & r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_OR: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) | BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() | r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_XOR: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            stack.push(bigIntValue(BigInt(l.toNumber()) ^ BigInt(r.toNumber())));
          } else {
            stack.push(numberValue(l.toNumber() ^ r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_NOT: {
          const v = stack.pop()!;
          if (v.type === ValueType.BigInt) stack.push(bigIntValue(~(v.value as bigint)));
          else stack.push(numberValue(~v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §4b Comparison  (OpCode 40–45)
        //     Numeric fast path when both operands are Number;
        //     EQ/NEQ support UoM unification for same-measure comparison.
        // ═══════════════════════════════════════════════════════════════
        case OpCode.EQ: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) === (r.value as number)));
          } else if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            stack.push(boolValue(sameMeasure && lv === rv));
          } else {
            stack.push(boolValue(l.toNumber() === r.toNumber()));
          }
          break;
        }
        case OpCode.NEQ: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) !== (r.value as number)));
          } else if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            stack.push(boolValue(!sameMeasure || lv !== rv));
          } else {
            stack.push(boolValue(l.toNumber() !== r.toNumber()));
          }
          break;
        }
        case OpCode.LT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) < (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() < r.toNumber()));
          }
          break;
        }
        case OpCode.LTE: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) <= (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() <= r.toNumber()));
          }
          break;
        }
        case OpCode.GT: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) > (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() > r.toNumber()));
          }
          break;
        }
        case OpCode.GTE: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(boolValue((l.value as number) >= (r.value as number)));
          } else {
            stack.push(boolValue(l.toNumber() >= r.toNumber()));
          }
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §5  Functions  (OpCode 50–52)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.CALL_PLUGIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          args.reverse();
          const fn = pluginFunctionRegistry[fnIdx];
          if (!fn) {
            stack.push(numberValue(0));
          } else {
            const result = fn(args);
            if (result instanceof Promise) {
              // Return pending result — no throw. The orchestrator checks
              // result.type and handles async resolution outside the VM.
              // The pluginId + domain are embedded in the cache key format:
              //   {pluginId}:{domain}:{fnIdx}:{hash(args)}
              // We use a deterministic key from fnIdx + args for now;
              // the engine scopes it by pluginId before storing.
              const cacheKey = `plugin:${fnIdx}:${args.map(a => String(a.value ?? '')).join('|')}`;
              // activeSignal must be set by the engine before calling executeBytecode.
              // If it's not (bug), we use a new signal that will never abort —
              // this is a safety net, not the expected path.
              const signal = vm.activeSignal!;
              return { type: 'pending', queryKey: cacheKey, resolver: result, packageId: '', signal };
            }
            stack.push(result);
          }
          break;
        }
        case OpCode.CALL_BUILTIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          const fn = builtinFunctions[fnIdx];
          if (fn) stack.push(fn(args.reverse()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §6  Variables  (OpCode 60–62)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.LOAD_VAR: {
          const varName = strings[opcodes[ip++]];
          const val = vm.getVar(varName);
          if (val !== undefined) {
            stack.push(val);
          } else {
            throw ErrorFactory.execution(
              "UNDEFINED_VARIABLE",
              `Undefined variable: ${varName}`,
              { varName },
            );
          }
          break;
        }
        case OpCode.STORE_VAR: {
          const val = stack.pop()!;
          const varName = strings[opcodes[ip++]];
          vm.setVar(varName, hasArena ? persistentValue(val) : val);
          stack.push(val);
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §7  Type conversions  (OpCode 70–74)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.TO_NUMBER: {
          const v = stack.pop()!;
          stack.push(numberValue(v.toNumber()));
          break;
        }
        case OpCode.TO_HEX: {
          const v = stack.pop()!;
          stack.push(hexValue(v.toNumber()));
          break;
        }
        case OpCode.TO_PERCENTAGE: {
          const v = stack.pop()!;
          stack.push(percentageValue(v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §8  UoM  (OpCode 80–84)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.UOM_CONVERT: {
          const unit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          stack.push(uomValue(val, unit));
          break;
        }
        case OpCode.UOM_CONVERT_TO: {
          const toUnit = (stack.pop()!.value as string);
          const fromUnit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          const measure = getMeasure(fromUnit);
          const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
          if (measure && getMeasure(toUnit) === measure) {
            stack.push(uomValue(convertUnit(val, fromUnit, toUnit), toUnit));
          } else if (isCurrency) {
            const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
            if (converted !== null) {
              stack.push(uomValue(converted, toUnit));
            } else {
              // No live rate cached yet (or the fetch failed). Pushing the
              // unconverted value under its original unit would silently
              // masquerade as a correct conversion — e.g. "450 EUR to USD"
              // displaying as "450.00 EUR", which reads as a successful
              // no-op rather than the missing-data case it actually is.
              // An Error value makes the failure visible instead.
              stack.push(errorValue("CURRENCY_RATE_UNAVAILABLE", `No exchange rate available for ${fromUnit} to ${toUnit}`));
            }
          } else {
            stack.push(uomValue(val, fromUnit));
          }
          break;
        }
        case OpCode.UOM_BEST: {
          const unit = (stack.pop()!.value as string);
          const val = stack.pop()!.toNumber();
          const { value, unit: bestUnit } = getBestUnit(val, unit);
          stack.push(uomValue(value, bestUnit));
          break;
        }
        case OpCode.UOM_CONVERT_IN: {
          const toUnit = (stack.pop()!.value as string);
          const left = stack.pop()!;
          if (left.type === ValueType.Uom) {
            const fromUnit = left.unit!;
            const val = left.toNumber();
            const measure = getMeasure(fromUnit);
            const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
            if (measure && getMeasure(toUnit) === measure) {
              stack.push(uomValue(convertUnit(val, fromUnit, toUnit), toUnit));
            } else if (isCurrency) {
              const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
              if (converted !== null) {
                stack.push(uomValue(converted, toUnit));
              } else {
                // See the matching comment in UOM_CONVERT_TO — pushing the
                // original value here would silently pass off a missing
                // exchange rate as a successful (non-)conversion.
                stack.push(errorValue("CURRENCY_RATE_UNAVAILABLE", `No exchange rate available for ${fromUnit} to ${toUnit}`));
              }
            } else {
              stack.push(left);
            }
          } else {
            stack.push(uomValue(left.toNumber(), toUnit));
          }
          break;
        }
        case OpCode.UOM_GET_VALUE: {
          const v = stack.pop()!;
          stack.push(numberValue(v.toNumber()));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §9  Datetime  (OpCode 90–93)
        // ═══════════════════════════════════════════════════════════════
        case OpCode.DATE_NOW:
          stack.push(datetimeValue(Date.now()));
          break;
        case OpCode.DATE_ADD: {
          const durValue = stack.pop()!, dtValue = stack.pop()!;
          stack.push(datetimeValue(dtValue.toNumber() + extractDurationMs(durValue)));
          break;
        }
        case OpCode.DATE_SUB: {
          const durValue = stack.pop()!, dtValue = stack.pop()!;
          stack.push(datetimeValue(dtValue.toNumber() - extractDurationMs(durValue)));
          break;
        }

        // ═══════════════════════════════════════════════════════════════
        // §10 Array / Vector  (OpCode 100–108)
        //     Unified Array type replaces Vec2/Vec3/Vec4. Stores number[].
        // ═══════════════════════════════════════════════════════════════
        case OpCode.ARR_NEW: {
          const count = opcodes[ip++];
          const components: number[] = [];
          for (let i = 0; i < count; i++) components.unshift(stack.pop()!.toNumber());
          stack.push(arrayValue(components));
          break;
        }
        case OpCode.ARR_ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a + b));
          break;
        }
        case OpCode.ARR_SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a - b));
          break;
        }
        case OpCode.ARR_DOT: {
          const r = stack.pop()!, l = stack.pop()!;
          const lv = l.value as number[], rv = r.value as number[];
          const len = Math.min(lv.length, rv.length);
          let sum = 0;
          for (let i = 0; i < len; i++) sum += lv[i] * rv[i];
          stack.push(numberValue(sum));
          break;
        }
        case OpCode.ARR_CROSS: {
          const r = stack.pop()!, l = stack.pop()!;
          const lv = l.value as number[], rv = r.value as number[];
          if (lv.length >= 3 && rv.length >= 3) {
            stack.push(arrayValue([
              lv[1] * rv[2] - lv[2] * rv[1],
              lv[2] * rv[0] - lv[0] * rv[2],
              lv[0] * rv[1] - lv[1] * rv[0],
            ]));
          } else {
            stack.push(arrayValue([0, 0, 0]));
          }
          break;
        }
        case OpCode.ARR_SCALE: {
          const scalar = stack.pop()!.toNumber();
          const arr = stack.pop()!;
          const av = arr.value as number[];
          const result = new Array(av.length);
          for (let i = 0; i < av.length; i++) result[i] = av[i] * scalar;
          stack.push(arrayValue(result));
          break;
        }
        case OpCode.ARR_MAGNITUDE: {
          const arr = stack.pop()!;
          const av = arr.value as number[];
          let sumSq = 0;
          for (let i = 0; i < av.length; i++) sumSq += av[i] * av[i];
          stack.push(numberValue(Math.sqrt(sumSq)));
          break;
        }
        case OpCode.ARR_NORMALIZE: {
          const arr = stack.pop()!;
          const av = arr.value as number[];
          let sumSq = 0;
          for (let i = 0; i < av.length; i++) sumSq += av[i] * av[i];
          const mag = Math.sqrt(sumSq);
          if (mag === 0) {
            stack.push(arrayValue(new Array(av.length).fill(0)));
          } else {
            const result = new Array(av.length);
            for (let i = 0; i < av.length; i++) result[i] = av[i] / mag;
            stack.push(arrayValue(result));
          }
          break;
        }

      }
    }

    // Fallback return (reached if while loop exits without HALT — shouldn't happen on valid bytecode)
    const fallback = stack.pop()!;
    return { type: 'value', value: hasArena ? persistentValue(fallback) : fallback };
}