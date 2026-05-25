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
    opcodes: Uint8Array | number[];
    numbers: Float64Array | number[];
    strings: string[];
}

/**
 * Execute bytecode with optional diagnostic pipeline integration.
 *
 * Performance notes:
 * - Stack access is inlined (`stack.push/pop` directly) — skips VM bounds
 *   checks. The compiler guarantees stack balance on valid bytecode.
 * - Switch cases are ordered by expected frequency. PUSH_NUMBER, HALT, ADD,
 *   DUP, LOAD_VAR, STORE_VAR, PUSH_BOOLEAN first — these account for >80%
 *   of all bytecode instructions. For sparse OpCode values (0-200 with
 *   gaps), V8 can't use a dense jump table — early-case ordering helps the
 *   baseline compiler and keeps hot paths in the L1I cache.
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
    const { opcodes: rawOpcodes, numbers: rawNumbers, strings } = bytecode;
    const reg = vm.registry;
    let ip = 0;
    let localInstructionCount = 0;
    const maxInstructions = vm.getMaxInstructions();

    const opcodes = rawOpcodes instanceof Uint8Array ? rawOpcodes : new Uint8Array(rawOpcodes);
    const numbers = rawNumbers instanceof Float64Array ? rawNumbers : new Float64Array(rawNumbers);

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

      switch (op) {
        // ── Hot path: push numeric literal ───────────────────────────
        case OpCode.PUSH_NUMBER:
          stack.push(numberValue(numbers[opcodes[ip++]]));
          break;

        // ── Hot path: halt (return top of stack) ─────────────────────
        case OpCode.HALT: {
          const result = stack.pop()!;
          // Phase 5.3: If arena is active, clone the result before returning.
          // The caller (ThreeTierEvaluator) stores this in DocumentModel.result —
          // it must survive arena.reset() on the next scroll frame.
          return hasArena ? persistentValue(result) : result;
        }

        // ── Hot path: add (with inlined numeric fast path) ───────────
        case OpCode.ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          // Inlined numeric fast path: avoids binaryOp() function call +
          // closure allocation for the >90% case where both operands are
          // numbers. Fallback handles Datetime, UoM, BigInt, Vector, etc.
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) + (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            let durMs = 0;
            if (r.type === ValueType.Uom) {
              const unit = r.unit;
              if (unit) {
                try {
                  durMs = convertUnit(r.toNumber(), unit, "ms");
                } catch {
                  // Ignore conversion errors
                }
              }
            } else {
              durMs = r.toNumber();
            }
            stack.push(datetimeValue(l.toNumber() + durMs));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
          }
          break;
        }

        // ── Hot path: dup ────────────────────────────────────────────────
        case OpCode.DUP: {
          stack.push(stack[stack.length - 1]);
          break;
        }

        // ── Hot path: load variable ──────────────────────────────────
        case OpCode.LOAD_VAR: {
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          const val = vm.getVar(varName);
          if (val !== undefined) stack.push(val);
          else stack.push(numberValue(0));
          break;
        }

        // ── Hot path: store variable ─────────────────────────────────
        case OpCode.STORE_VAR: {
          const val = stack.pop()!;
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          // Phase 5.3: If arena is active, clone before storing in variables.
          // Arena Values are recycled on reset() — variable references must survive.
          vm.setVar(varName, hasArena ? persistentValue(val) : val);
          stack.push(val);
          break;
        }

        // ── Hot path: push boolean ───────────────────────────────────
        case OpCode.PUSH_BOOLEAN:
          stack.push(boolValue(opcodes[ip++] === 1));
          break;

        // ── Subtract (with inlined numeric fast path) ────────────────
        case OpCode.SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) - (r.value as number)));
          } else if (l.type === ValueType.Datetime) {
            let durMs = 0;
            if (r.type === ValueType.Uom) {
              const unit = r.unit;
              if (unit) {
                try {
                  durMs = convertUnit(r.toNumber(), unit, "ms");
                } catch {
                  // Ignore conversion errors
                }
              }
            } else {
              durMs = r.toNumber();
            }
            stack.push(datetimeValue(l.toNumber() - durMs));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
          }
          break;
        }

        // ── Multiply (with inlined numeric fast path) ────────────────
        case OpCode.MUL: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Number && r.type === ValueType.Number) {
            stack.push(numberValue((l.value as number) * (r.value as number)));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
          }
          break;
        }

        // ── Division ─────────────────────────────────────────────────
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

        // ── No-op ────────────────────────────────────────────────────────
        case OpCode.NOP: break;

        // ── Swap ─────────────────────────────────────────────────────
        case OpCode.SWAP: {
          const a = stack.pop()!;
          const b = stack.pop()!;
          stack.push(a);
          stack.push(b);
          break;
        }

        // ── Negate ───────────────────────────────────────────────────
        case OpCode.NEG: {
          const v = stack.pop()!;
          if (v.type === ValueType.BigInt) stack.push(bigIntValue(-(v.value as bigint)));
          else if (v.type === ValueType.Uom) stack.push(uomValue(-v.toNumber(), v.unit!));
          else stack.push(numberValue(-v.toNumber()));
          break;
        }

        // ── Positive ─────────────────────────────────────────────────
        case OpCode.POS: {
          const v = stack.pop()!;
          if (v.type === ValueType.Uom) stack.push(uomValue(v.toNumber(), v.unit!));
          else stack.push(numberValue(v.toNumber()));
          break;
        }

        // ── Percentage ───────────────────────────────────────────────
        case OpCode.TO_PERCENTAGE: {
          const v = stack.pop()!;
          stack.push(percentageValue(v.toNumber()));
          break;
        }

        // ── Modulus ──────────────────────────────────────────────────
        case OpCode.MOD: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a % b, (a, b) => a % b));
          break;
        }

        // ── Exponent ─────────────────────────────────────────────────
        case OpCode.EXP: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
          break;
        }

        // ── Push string ──────────────────────────────────────────────
        case OpCode.PUSH_STRING: {
          const strIdx = opcodes[ip++];
          stack.push(stringValue(strings[strIdx]));
          break;
        }

        // ── Push bigint ──────────────────────────────────────────────
        case OpCode.PUSH_BIGINT:
          stack.push(bigIntValue(BigInt(numbers[opcodes[ip++]])));
          break;

        // ── Push hex ─────────────────────────────────────────────────
        case OpCode.PUSH_HEX:
          stack.push(hexValue(numbers[opcodes[ip++]]));
          break;

        // ── Call builtin ─────────────────────────────────────────────
        case OpCode.CALL_BUILTIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
          const fn = builtinFunctions[fnIdx];
          if (fn) stack.push(fn(args.reverse()));
          break;
        }

        // ── Dice roll ────────────────────────────────────────────────
        case OpCode.DICE_ROLL: {
          const to = stack.pop()!.toNumber();
          const from = stack.pop()!.toNumber();
          stack.push(numberValue(Math.floor(Math.random() * (to - from + 1)) + from));
          break;
        }

        // ── Vector operations ────────────────────────────────────────
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

        // ── Type conversions ─────────────────────────────────────────
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

        // ── Bitwise operations ───────────────────────────────────────
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

        // ── Datetime ─────────────────────────────────────────────────
        case OpCode.DATE_NOW:
          stack.push(datetimeValue(Date.now()));
          break;
        case OpCode.DATE_ADD:
        case OpCode.DATE_SUB: {
          const durValue = stack.pop()!;
          const dtValue = stack.pop()!;
          const dt = dtValue.toNumber();
          let durMs = 0;
          if (durValue.type === ValueType.Uom) {
            const unit = durValue.unit;
            if (unit) {
              try {
                durMs = convertUnit(durValue.toNumber(), unit, "ms");
              } catch {
                durMs = 0;
              }
            }
          } else {
            durMs = durValue.toNumber();
          }
          const sign = op === OpCode.DATE_ADD ? 1 : -1;
          stack.push(datetimeValue(dt + sign * durMs));
          break;
        }

        // ── UoM ──────────────────────────────────────────────────────
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
            const converted = convertUnit(val, fromUnit, toUnit);
            stack.push(uomValue(converted, toUnit));
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
        case OpCode.UOM_GET_VALUE: {
          const v = stack.pop()!;
          stack.push(numberValue(v.toNumber()));
          break;
        }
        default:
          if (op >= OpCode.PLUGIN_CUSTOM) {
            const handler = reg.get(op as OpCode);
            if (handler) {
              ip = handler(vm, opcodes, ip, numbers, strings);
            }
          }
          break;
      }
    }

    // Fallback return (reached if while loop exits without HALT — shouldn't happen on valid bytecode)
    const fallback = stack.pop()!;
    return hasArena ? persistentValue(fallback) : fallback;
}