import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, vectorValue, boolValue, datetimeValue, percentageValue, persistentValue, isArenaActive } from "@solve-js/vm/Value";
import { OpRegistry, type VM } from "@solve-js/vm/OpRegistry";
import { convertUnit, getMeasure, getBestUnit } from "@solve-js/uom/UomConverter";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { DiagnosticPipeline, DiagnosticEventType } from "@solve-js/diagnostics";
import { builtinFunctions } from "@solve-js/vm/VMBuiltins";
import { getOpCodeName } from "@solve-js/parser/OpCode";
import { unifyUom, binaryOp } from "@solve-js/vm/VMConversion";

export function createVM(registry: OpRegistry, maxStackDepth = 200, maxInstructions = 50000): VM {
    const stack: Value[] = [];
    const variables = new Map<string, Value>();
    let instructionCount = 0;

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
      },
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

export interface Bytecode {
    opcodes: Uint8Array;
    numbers: Float64Array;
    strings: string[];
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
): Value | undefined {
    const { opcodes, numbers, strings } = bytecode;
    const reg = vm.registry;
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

    if (opcodes.length === 0) return undefined;

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
        pipeline!.fireVmStep({
          type: DiagnosticEventType.VmStep,
          elapsedNs: 0,
          expression: expression ?? "",
          opcode: op,
          opcodeName: getOpCodeName(op),
          ip: ip - 1,
          stackDepth: stack.length,
          instructionNumber: localInstructionCount,
        });
      }

      // ── switch dispatch: V8 compiles to jump table for dense opcodes ──
      switch (op) {
        // ── Stack operations ────────────────────────────────────────────
        case OpCode.NOP:
          break;
        case OpCode.DUP:
          stack.push(stack[stack.length - 1]);
          break;
        case OpCode.SWAP: {
          const a = stack.pop()!, b = stack.pop()!;
          stack.push(a);
          stack.push(b);
          break;
        }

        // ── Push literals ───────────────────────────────────────────────
        case OpCode.PUSH_NUMBER:
          stack.push(numberValue(numbers[opcodes[ip++]]));
          break;
        case OpCode.PUSH_BIGINT:
          stack.push(bigIntValue(BigInt(numbers[opcodes[ip++]])));
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

        // ── Arithmetic (inlined numeric fast paths) ────────────────────
        case OpCode.ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) + (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            stack.push(datetimeValue(l.toNumber() + extractDurationMs(r)));
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
            stack.push(datetimeValue(l.toNumber() - extractDurationMs(r)));
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
              stack.push(uomValue(lv / rv, l.unit!));
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

        // ── Unary operators ─────────────────────────────────────────────
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

        // ── Type conversions ────────────────────────────────────────────
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

        // ── Bitwise operations ──────────────────────────────────────────
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

        // ── Variables ───────────────────────────────────────────────────
        case OpCode.LOAD_VAR: {
          const varName = strings[opcodes[ip++]];
          const val = vm.getVar(varName);
          if (val !== undefined) stack.push(val);
          else stack.push(numberValue(0));
          break;
        }
        case OpCode.STORE_VAR: {
          const val = stack.pop()!;
          const varName = strings[opcodes[ip++]];
          vm.setVar(varName, hasArena ? persistentValue(val) : val);
          stack.push(val);
          break;
        }

        // ── Datetime ────────────────────────────────────────────────────
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

        // ── UoM ─────────────────────────────────────────────────────────
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
              stack.push(uomValue(val, fromUnit));
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
                stack.push(left);
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

        // ── Vector operations ───────────────────────────────────────────
        case OpCode.VEC_NEW: {
          const count = opcodes[ip++];
          const components: number[] = [];
          for (let i = 0; i < count; i++) components.unshift(stack.pop()!.toNumber());
          stack.push(vectorValue(components));
          break;
        }
        case OpCode.VEC_ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a + b));
          break;
        }
        case OpCode.VEC_SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a - b));
          break;
        }

        // ── Dice roll ───────────────────────────────────────────────────
        case OpCode.DICE_ROLL: {
          const to = stack.pop()!.toNumber();
          const from = stack.pop()!.toNumber();
          stack.push(numberValue(Math.floor(Math.random() * (to - from + 1)) + from));
          break;
        }

        // ── Call builtin ────────────────────────────────────────────────
        case OpCode.CALL_BUILTIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          const fn = builtinFunctions[fnIdx];
          if (fn) stack.push(fn(args.reverse()));
          break;
        }

        // ── Plugin custom opcode ────────────────────────────────────────
        case OpCode.PLUGIN_CUSTOM: {
          const handler = reg.get(OpCode.PLUGIN_CUSTOM);
          if (handler) {
            ip = handler(vm, opcodes, ip, numbers, strings);
            continue; // plugin handler advances ip itself
          }
          break;
        }

        // ── HALT: return result ─────────────────────────────────────────
        case OpCode.HALT: {
          const result = stack.pop()!;
          return hasArena ? persistentValue(result) : result;
        }

        // ── Unknown/plugin opcodes > PLUGIN_CUSTOM ──────────────────────
        default:
          if (op >= OpCode.PLUGIN_CUSTOM) {
            const pluginHandler = reg.get(op as OpCode);
            if (pluginHandler) {
              ip = pluginHandler(vm, opcodes, ip, numbers, strings);
              continue; // plugin handler advances ip itself
            }
          }
          break;
      }
    }

    // Fallback return (reached if while loop exits without HALT — shouldn't happen on valid bytecode)
    const fallback = stack.pop()!;
    return hasArena ? persistentValue(fallback) : fallback;
}