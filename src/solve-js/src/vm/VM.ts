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
 * When a pipeline with collectors is provided and vmTrace is enabled,
 * fires vm_step events for every opcode. When no collectors are active,
 * this adds zero overhead beyond a single branch check.
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

    // Hoist trace check outside the hot loop. When disabled (production),
    // traceStep is a no-op that the JIT will inline away entirely.
    // When enabled, it fires a diagnostic VM step event per opcode.
    const traceStep = pipeline?.hasCollectors
      ? (op: OpCode, ipVal: number, instrNum: number) => {
          pipeline!.fireVmStep({
            type: DiagnosticEventType.VmStep,
            elapsedNs: 0,
            expression: expression ?? "",
            opcode: op,
            opcodeName: getOpCodeName(op),
            ip: ipVal,
            stackDepth: vm.getStack().length,
            instructionNumber: instrNum,
          });
        }
      : (_op: OpCode, _ipVal: number, _instrNum: number) => {};

    if (opcodes.length === 0) return undefined;

    while (ip < opcodes.length) {
      localInstructionCount++;
      if (localInstructionCount > maxInstructions) {
        throw ErrorFactory.execution("INSTRUCTION_LIMIT_EXCEEDED", `Execution exceeded maximum of ${maxInstructions} instructions`);
      }
      const op = opcodes[ip++] as OpCode;

      traceStep(op, ip - 1, localInstructionCount);

      switch (op) {
        case OpCode.NOP: break;
        case OpCode.HALT: {
          const result = vm.pop();
          return result;
        }
        case OpCode.SWAP: {
          const a = vm.pop();
          const b = vm.pop();
          vm.push(a);
          vm.push(b);
          break;
        }
        case OpCode.DUP: {
          const a = vm.peek();
          vm.push(a);
          break;
        }
        case OpCode.PUSH_NUMBER: vm.push(numberValue(numbers[opcodes[ip++]])); break;
        case OpCode.PUSH_BIGINT: vm.push(bigIntValue(BigInt(numbers[opcodes[ip++]]))); break;
        case OpCode.PUSH_HEX: vm.push(hexValue(numbers[opcodes[ip++]])); break;
        case OpCode.PUSH_STRING: {
          const strIdx = opcodes[ip++];
          vm.push(stringValue(strings[strIdx]));
          break;
        }
        case OpCode.PUSH_BOOLEAN: vm.push(new Value(ValueType.Boolean, opcodes[ip++] === 1)); break;
        case OpCode.NEG: {
          const v = vm.pop();
          if (v.type === ValueType.BigInt) vm.push(bigIntValue(-(v.value as bigint)));
          else if (v.type === ValueType.Uom) vm.push(uomValue(-v.toNumber(), v.unit!));
          else vm.push(numberValue(-v.toNumber()));
          break;
        }
        case OpCode.POS: {
          const v = vm.pop();
          if (v.type === ValueType.Uom) vm.push(uomValue(v.toNumber(), v.unit!));
          else vm.push(numberValue(v.toNumber()));
          break;
        }
        case OpCode.ADD: {
          const r = vm.pop(), l = vm.pop();
          // Handle Datetime + Duration
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
            vm.push(new Value(ValueType.Datetime, l.toNumber() + durMs));
          } else {
            vm.push(binaryOp(l, r, (a, b) => a + b, (a, b) => a + b));
          }
          break;
        }
        case OpCode.SUB: {
          const r = vm.pop(), l = vm.pop();
          // Handle Datetime - Duration
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
            vm.push(new Value(ValueType.Datetime, l.toNumber() - durMs));
          } else {
            vm.push(binaryOp(l, r, (a, b) => a - b, (a, b) => a - b));
          }
          break;
        }
        case OpCode.MUL: {
          const r = vm.pop(), l = vm.pop();
          vm.push(binaryOp(l, r, (a, b) => a * b, (a, b) => a * b));
          break;
        }
        case OpCode.DIV: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
            const { lv, rv, sameMeasure } = unifyUom(l, r);
            if (sameMeasure) {
              vm.push(numberValue(lv / rv));
            } else {
              vm.push(uomValue(lv / rv, l.unit!));
            }
          } else {
            vm.push(binaryOp(l, r, (a, b) => a / b, (a, b) => a / b));
          }
          break;
        }
        case OpCode.MOD: {
          const r = vm.pop(), l = vm.pop();
          vm.push(binaryOp(l, r, (a, b) => a % b, (a, b) => a % b));
          break;
        }
        case OpCode.EXP: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.Uom) {
            vm.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
          } else {
            vm.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
          }
          break;
        }
        case OpCode.LSHIFT: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            vm.push(bigIntValue(BigInt(l.toNumber()) << BigInt(r.toNumber())));
          } else {
            vm.push(numberValue(l.toNumber() << r.toNumber()));
          }
          break;
        }
        case OpCode.RSHIFT: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            vm.push(bigIntValue(BigInt(l.toNumber()) >> BigInt(r.toNumber())));
          } else {
            vm.push(numberValue(l.toNumber() >> r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_AND: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            vm.push(bigIntValue(BigInt(l.toNumber()) & BigInt(r.toNumber())));
          } else {
            vm.push(numberValue(l.toNumber() & r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_OR: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            vm.push(bigIntValue(BigInt(l.toNumber()) | BigInt(r.toNumber())));
          } else {
            vm.push(numberValue(l.toNumber() | r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_XOR: {
          const r = vm.pop(), l = vm.pop();
          if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
            vm.push(bigIntValue(BigInt(l.toNumber()) ^ BigInt(r.toNumber())));
          } else {
            vm.push(numberValue(l.toNumber() ^ r.toNumber()));
          }
          break;
        }
        case OpCode.BIT_NOT: {
          const v = vm.pop();
          if (v.type === ValueType.BigInt) vm.push(bigIntValue(~(v.value as bigint)));
          else vm.push(numberValue(~v.toNumber()));
          break;
        }
        case OpCode.TO_NUMBER: {
          const v = vm.pop();
          vm.push(numberValue(v.toNumber()));
          break;
        }
        case OpCode.TO_HEX: {
          const v = vm.pop();
          vm.push(hexValue(v.toNumber()));
          break;
        }
        case OpCode.TO_PERCENTAGE: {
          const v = vm.pop();
          vm.push(new Value(ValueType.Percentage, v.toNumber()));
          break;
        }
        case OpCode.CALL_BUILTIN: {
          const fnIdx = opcodes[ip++];
          const argCount = opcodes[ip++];
          const args: Value[] = [];
          for (let i = 0; i < argCount; i++) args.push(vm.pop());
          const fn = builtinFunctions[fnIdx];
          if (fn) vm.push(fn(args.reverse()));
          break;
        }
        case OpCode.DICE_ROLL: {
          const to = vm.popNumber();
          const from = vm.popNumber();
          vm.push(numberValue(Math.floor(Math.random() * (to - from + 1)) + from));
          break;
        }
        case OpCode.VEC_NEW: {
          const count = opcodes[ip++];
          const components: number[] = [];
          for (let i = 0; i < count; i++) components.unshift(vm.popNumber());
          vm.push(vectorValue(components));
          break;
        }
        case OpCode.VEC_ADD: {
          const r = vm.pop(), l = vm.pop();
          vm.push(binaryOp(l, r, (a, b) => a + b));
          break;
        }
        case OpCode.VEC_SUB: {
          const r = vm.pop(), l = vm.pop();
          vm.push(binaryOp(l, r, (a, b) => a - b));
          break;
        }
        case OpCode.DATE_NOW:
          vm.push(new Value(ValueType.Datetime, Date.now()));
          break;
        case OpCode.DATE_ADD:
        case OpCode.DATE_SUB: {
          const durValue = vm.pop();
          const dtValue = vm.pop();
          const dt = dtValue.toNumber();
          let durMs = 0;
          if (durValue.type === ValueType.Uom) {
            const unit = durValue.unit;
            if (unit) {
              try {
                durMs = convertUnit(durValue.toNumber(), unit, "ms");
              } catch {
                // If conversion fails, treat as 0
                durMs = 0;
              }
            }
          } else {
            // Assume it's a number (milliseconds)
            durMs = durValue.toNumber();
          }
          const sign = op === OpCode.DATE_ADD ? 1 : -1;
          vm.push(new Value(ValueType.Datetime, dt + sign * durMs));
          break;
        }
        case OpCode.UOM_CONVERT: {
          const unit = vm.popString();
          const val = vm.popNumber();
          vm.push(uomValue(val, unit));
          break;
        }
        case OpCode.UOM_CONVERT_TO: {
          const toUnit = vm.popString();
          const fromUnit = vm.popString();
          const val = vm.popNumber();
          const measure = getMeasure(fromUnit);
          const isCurrency = sharedCurrencyExchange.isCurrency(fromUnit) && sharedCurrencyExchange.isCurrency(toUnit);
          if (measure && getMeasure(toUnit) === measure) {
            const converted = convertUnit(val, fromUnit, toUnit);
            vm.push(uomValue(converted, toUnit));
          } else if (isCurrency) {
            const converted = sharedCurrencyExchange.convertSync(val, fromUnit, toUnit);
            if (converted !== null) {
              vm.push(uomValue(converted, toUnit));
            } else {
              vm.push(uomValue(val, fromUnit));
            }
          } else {
            vm.push(uomValue(val, fromUnit));
          }
          break;
        }
        case OpCode.UOM_BEST: {
          const unit = vm.popString();
          const val = vm.popNumber();
          const { value, unit: bestUnit } = getBestUnit(val, unit);
          vm.push(uomValue(value, bestUnit));
          break;
        }
        case OpCode.UOM_GET_VALUE: {
          const v = vm.pop();
          vm.push(numberValue(v.toNumber()));
          break;
        }
        case OpCode.LOAD_VAR: {
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          const val = vm.getVar(varName);
          if (val !== undefined) vm.push(val);
          else vm.push(numberValue(0));
          break;
        }
        case OpCode.STORE_VAR: {
          const val = vm.pop();
          const varIdx = opcodes[ip++];
          const varName = strings[varIdx];
          vm.setVar(varName, val);
          vm.push(val);
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

    return vm.pop();
}