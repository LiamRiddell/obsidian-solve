import { OpCode } from "@solve-js/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, uomValue, vectorValue } from "@solve-js/vm/Value";
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
 * - Tracing uses a boolean guard (`shouldTrace`) that the JIT eliminates
 *   entirely when diagnostics are disabled. No function call overhead.
 * - `binaryOp()` has its own numeric fast-path that skips type dispatch
 *   when both operands are plain numbers (~90%+ of all binary ops).
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

    if (opcodes.length === 0) return undefined;

    while (ip < opcodes.length) {
      localInstructionCount++;
      if (localInstructionCount > maxInstructions) {
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
        case OpCode.NOP: break;
        case OpCode.HALT: {
          return stack.pop()!;
        }
        case OpCode.SWAP: {
          const a = stack.pop()!;
          const b = stack.pop()!;
          stack.push(a);
          stack.push(b);
          break;
        }
        case OpCode.DUP: {
          stack.push(stack[stack.length - 1]);
          break;
        }
        case OpCode.PUSH_NUMBER: stack.push(numberValue(numbers[opcodes[ip++]])); break;
        case OpCode.PUSH_BIGINT: stack.push(bigIntValue(BigInt(numbers[opcodes[ip++]]))); break;
        case OpCode.PUSH_HEX: stack.push(hexValue(numbers[opcodes[ip++]])); break;
        case OpCode.PUSH_STRING: {
          const strIdx = opcodes[ip++];
          stack.push(stringValue(strings[strIdx]));
          break;
        }
        case OpCode.PUSH_BOOLEAN: stack.push(new Value(ValueType.Boolean, opcodes[ip++] === 1)); break;
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
        case OpCode.ADD: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Datetime) {
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
            stack.push(new Value(ValueType.Datetime, l.toNumber() + durMs));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
          }
          break;
        }
        case OpCode.SUB: {
          const r = stack.pop()!, l = stack.pop()!;
          if (l.type === ValueType.Datetime) {
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
            stack.push(new Value(ValueType.Datetime, l.toNumber() - durMs));
          } else {
            stack.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
          }
          break;
        }
        case OpCode.MUL: {
          const r = stack.pop()!, l = stack.pop()!;
          stack.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
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
          stack.push(new Value(ValueType.Percentage, v.toNumber()));
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
        case OpCode.DICE_ROLL: {
          const to = stack.pop()!.toNumber();
          const from = stack.pop()!.toNumber();
          stack.push(numberValue(Math.floor(Math.random() * (to - from + 1)) + from));
          break;
        }
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
        case OpCode.DATE_NOW:
          stack.push(new Value(ValueType.Datetime, Date.now()));
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
          stack.push(new Value(ValueType.Datetime, dt + sign * durMs));
          break;
        }
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
        case OpCode.LOAD_VAR: {
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          const val = vm.getVar(varName);
          if (val !== undefined) stack.push(val);
          else stack.push(numberValue(0));
          break;
        }
        case OpCode.STORE_VAR: {
          const val = stack.pop()!;
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          vm.setVar(varName, val);
          stack.push(val);
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

    return stack.pop()!;
}