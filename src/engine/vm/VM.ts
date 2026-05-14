import { OpCode } from "@/engine/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, vectorValue, uomValue } from "@/engine/vm/Value";
import { OpRegistry, type VM } from "@/engine/vm/OpRegistry";
import { convertUnit, getMeasure, getBestUnit } from "@/engine/uom/UomConverter";
import { sharedCurrencyExchange } from "@/engine/uom/CurrencyExchange";

export function createVM(registry: OpRegistry): VM {
  const stack: Value[] = [];
  const variables = new Map<string, Value>();

  return {
    push(v: Value) { stack.push(v); },
    pop() { return stack.pop()!; },
    popNumber() { return stack.pop()!.toNumber(); },
    popString() { return (stack.pop()!.value as string); },
    peek() { return stack[stack.length - 1]; },
    getStack() { return stack; },
    registry,
    getVar(key: string) { return variables.get(key); },
    setVar(key: string, val: Value) { variables.set(key, val); },
  };
}

export interface Bytecode {
  opcodes: Uint8Array;
  numbers: Float64Array;
  strings: string[];
}

function unifyUom(l: Value, r: Value): { lv: number; rv: number; unit: string | undefined; sameMeasure: boolean } {
  if (l.type === ValueType.Uom && r.type === ValueType.Uom) {
    if (l.unit === r.unit) {
      return { lv: l.toNumber(), rv: r.toNumber(), unit: l.unit, sameMeasure: true };
    }
    const lMeasure = getMeasure(l.unit!);
    const rMeasure = getMeasure(r.unit!);
    const isCurrency = sharedCurrencyExchange.isCurrency(l.unit!) && sharedCurrencyExchange.isCurrency(r.unit!);

    if (lMeasure && lMeasure === rMeasure) {
      const rvConverted = convertUnit(r.toNumber(), r.unit!, l.unit!);
      return { lv: l.toNumber(), rv: rvConverted, unit: l.unit, sameMeasure: true };
    }
    if (isCurrency) {
      const rvConverted = sharedCurrencyExchange.convert(r.toNumber(), r.unit!, l.unit!);
      return { lv: l.toNumber(), rv: rvConverted, unit: l.unit, sameMeasure: true };
    }
    return { lv: l.toNumber(), rv: r.toNumber(), unit: undefined, sameMeasure: false };
  }
  if (l.type === ValueType.Uom) {
    return { lv: l.toNumber(), rv: r.toNumber(), unit: l.unit, sameMeasure: true };
  }
  if (r.type === ValueType.Uom) {
    return { lv: l.toNumber(), rv: r.toNumber(), unit: r.unit, sameMeasure: true };
  }
  return { lv: l.toNumber(), rv: r.toNumber(), unit: undefined, sameMeasure: true };
}

function binaryOp(
  l: Value, r: Value,
  op: (a: number, b: number) => number,
  bigOp?: (a: bigint, b: bigint) => bigint
): Value {
  if (l.type === ValueType.BigInt || r.type === ValueType.BigInt) {
    const lb = BigInt(l.toNumber());
    const rb = BigInt(r.toNumber());
    if (bigOp) return bigIntValue(bigOp(lb, rb));
    return bigIntValue(lb + rb);
  }

  if (l.type === ValueType.Uom || r.type === ValueType.Uom) {
    const { lv, rv, unit } = unifyUom(l, r);
    return uomValue(op(lv, rv), unit!);
  }

  if ((l.type === ValueType.Vector2 || l.type === ValueType.Vector3 || l.type === ValueType.Vector4) &&
      (r.type === ValueType.Vector2 || r.type === ValueType.Vector3 || r.type === ValueType.Vector4)) {
    const lv = l.value as number[];
    const rv = r.value as number[];
    const len = Math.min(lv.length, rv.length);
    const result: number[] = [];
    for (let i = 0; i < len; i++) result.push(op(lv[i], rv[i]));
    return vectorValue(result);
  }

  if (l.type === ValueType.Vector2 || l.type === ValueType.Vector3 || l.type === ValueType.Vector4) {
    const lv = l.value as number[];
    const result = lv.map(v => op(v, r.toNumber()));
    return vectorValue(result);
  }

  if (r.type === ValueType.Vector2 || r.type === ValueType.Vector3 || r.type === ValueType.Vector4) {
    const rv = r.value as number[];
    const result = rv.map(v => op(l.toNumber(), v));
    return vectorValue(result);
  }

  return numberValue(op(l.toNumber(), r.toNumber()));
}

export function executeBytecode(bytecode: Bytecode, vm: VM): Value | undefined {
  const { opcodes, numbers, strings } = bytecode;
  const reg = vm.registry;
  let ip = 0;

  while (ip < opcodes.length) {
    const op = opcodes[ip++] as OpCode;
    switch (op) {
      case OpCode.NOP: break;
      case OpCode.HALT: return vm.pop();
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
              } catch {}
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
              } catch {}
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
          // Convert UoM duration to milliseconds
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
          const converted = sharedCurrencyExchange.convert(val, fromUnit, toUnit);
          vm.push(uomValue(converted, toUnit));
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

const builtinFunctions: Record<number, (args: Value[]) => Value> = {
  0: (args) => numberValue(Math.sqrt(args[0].toNumber())),
  1: (args) => numberValue(Math.abs(args[0].toNumber())),
  2: (args) => numberValue(Math.sin(args[0].toNumber())),
  3: (args) => numberValue(Math.cos(args[0].toNumber())),
  4: (args) => numberValue(Math.tan(args[0].toNumber())),
  5: (args) => numberValue(Math.log(args[0].toNumber())),
  6: (args) => numberValue(Math.ceil(args[0].toNumber())),
  7: (args) => numberValue(Math.floor(args[0].toNumber())),
  8: (args) => numberValue(Math.round(args[0].toNumber())),
  9: (args) => numberValue(Math.min(...args.map(a => a.toNumber()))),
  10: (args) => numberValue(Math.max(...args.map(a => a.toNumber()))),
  11: (args) => numberValue(Math.asin(args[0].toNumber())),
  12: (args) => numberValue(Math.acos(args[0].toNumber())),
  13: (args) => numberValue(Math.atan(args[0].toNumber())),
  14: (args) => numberValue(Math.atan2(args[0].toNumber(), args[1].toNumber())),
  15: (args) => numberValue(Math.sinh(args[0].toNumber())),
  16: (args) => numberValue(Math.cosh(args[0].toNumber())),
  17: (args) => numberValue(Math.tanh(args[0].toNumber())),
  18: (args) => numberValue(Math.asinh(args[0].toNumber())),
  19: (args) => numberValue(Math.acosh(args[0].toNumber())),
  20: (args) => numberValue(Math.atanh(args[0].toNumber())),
  21: (args) => numberValue(Math.cbrt(args[0].toNumber())),
  22: (args) => numberValue(Math.clz32(args[0].toNumber())),
  23: (args) => numberValue(Math.expm1(args[0].toNumber())),
  24: (args) => numberValue(Math.exp(args[0].toNumber())),
  25: (args) => numberValue(Math.fround(args[0].toNumber())),
  26: (args) => numberValue(Math.hypot(...args.map(a => a.toNumber()))),
  27: (args) => numberValue(Math.imul(args[0].toNumber(), args[1].toNumber())),
  28: (args) => numberValue(Math.log10(args[0].toNumber())),
  29: (args) => numberValue(Math.log1p(args[0].toNumber())),
  30: (args) => numberValue(Math.log2(args[0].toNumber())),
  31: (args) => numberValue(Math.pow(args[0].toNumber(), args[1].toNumber())),
  32: (args) => numberValue(Math.random()),
  33: (args) => numberValue(Math.sign(args[0].toNumber())),
  34: (args) => numberValue(Math.trunc(args[0].toNumber())),
  35: (args) => numberValue(args[0].toNumber() * Math.PI / 180),
  36: (args) => numberValue(args[0].toNumber() * 180 / Math.PI),
};
