import { OpCode } from "@/engine/parser/OpCode";
import { Value, ValueType, numberValue, stringValue, bigIntValue, hexValue, vectorValue } from "@/engine/vm/Value";
import { OpRegistry, type VM } from "@/engine/vm/OpRegistry";

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

export function executeBytecode(bytecode: Bytecode, vm: VM): Value | undefined {
	const { opcodes, numbers, strings } = bytecode;
	const reg = vm.registry;
	let ip = 0;

	while (ip < opcodes.length) {
		const op = opcodes[ip++] as OpCode;
		switch (op) {
			case OpCode.NOP:
				break;
			case OpCode.HALT:
				return vm.pop();
			case OpCode.PUSH_NUMBER:
				vm.push(numberValue(numbers[opcodes[ip++]]));
				break;
			case OpCode.PUSH_BIGINT:
				vm.push(bigIntValue(BigInt(numbers[opcodes[ip++]])));
				break;
			case OpCode.PUSH_HEX:
				vm.push(hexValue(numbers[opcodes[ip++]]));
				break;
			case OpCode.PUSH_STRING: {
				const strIdx = opcodes[ip++];
				vm.push(stringValue(strings[strIdx]));
				break;
			}
			case OpCode.PUSH_BOOLEAN:
				vm.push(new Value(ValueType.Boolean, opcodes[ip++] === 1));
				break;
			case OpCode.NEG: {
				const v = vm.pop();
				vm.push(numberValue(-v.toNumber()));
				break;
			}
			case OpCode.POS: {
				const v = vm.pop();
				vm.push(numberValue(v.toNumber()));
				break;
			}
			case OpCode.ADD: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(l.toNumber() + r.toNumber()));
				break;
			}
			case OpCode.SUB: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(l.toNumber() - r.toNumber()));
				break;
			}
			case OpCode.MUL: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(l.toNumber() * r.toNumber()));
				break;
			}
			case OpCode.DIV: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(l.toNumber() / r.toNumber()));
				break;
			}
			case OpCode.MOD: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(l.toNumber() % r.toNumber()));
				break;
			}
			case OpCode.EXP: {
				const r = vm.pop(), l = vm.pop();
				vm.push(numberValue(Math.pow(l.toNumber(), r.toNumber())));
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
			case OpCode.CALL_BUILTIN: {
				const fnIdx = opcodes[ip++];
				const argCount = opcodes[ip++];
				const args: Value[] = [];
				for (let i = 0; i < argCount; i++) args.unshift(vm.pop());
				const fn = builtinFunctions[fnIdx];
				if (fn) vm.push(fn(args));
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
			case OpCode.DATE_NOW:
				vm.push(new Value(ValueType.Datetime, Date.now()));
				break;
			case OpCode.LOAD_VAR: {
				const varIdx = opcodes[ip++];
				const varName = strings[varIdx];
				const val = vm.getVar(varName);
				if (val !== undefined) {
					vm.push(val);
				} else {
					vm.push(numberValue(0));
				}
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
};