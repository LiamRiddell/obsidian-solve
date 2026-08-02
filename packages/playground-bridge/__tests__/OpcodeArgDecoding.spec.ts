import { describe, expect, test } from "@jest/globals";
import { decodeOpcodeArgs } from "@bridge/engine";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * decodeOpcodeArgs() is the playground/webapp diagnostic-trace UI's own
 * bytecode-operand decoder — a separate, hand-maintained duplicate of the
 * operand-width knowledge VM.ts's dispatch loop and the three async
 * resolvers (QueryResolver/GlobalVariableAsyncResolver/CurrencyResolver)
 * each also carry. It was missing CALL_USER_FUNCTION/DEFINE_USER_FUNCTION
 * entirely (falling back to 0 operands) and excluded LOAD_GLOBAL_VAR/
 * STORE_GLOBAL_VAR from its 1-operand range check even though they sit
 * immediately adjacent to LOAD_VAR/STORE_VAR in the OpCode enum — both
 * would have corrupted the debug/trace view's rendering of any bytecode
 * containing those opcodes, silently misaligning every opcode after them.
 */
describe("decodeOpcodeArgs", () => {
	test("CALL_USER_FUNCTION returns its 2 operands (nameIdx, argCount)", () => {
		const bytes = new Uint8Array([OpCode.CALL_USER_FUNCTION, 5, 2, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.CALL_USER_FUNCTION, bytes, 0)).toEqual([5, 2]);
	});

	test("DEFINE_USER_FUNCTION returns its 1 operand (bodyIdx)", () => {
		const bytes = new Uint8Array([OpCode.DEFINE_USER_FUNCTION, 3, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.DEFINE_USER_FUNCTION, bytes, 0)).toEqual([3]);
	});

	test("LOAD_GLOBAL_VAR returns its 1 operand (name index)", () => {
		const bytes = new Uint8Array([OpCode.LOAD_GLOBAL_VAR, 7, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.LOAD_GLOBAL_VAR, bytes, 0)).toEqual([7]);
	});

	test("STORE_GLOBAL_VAR returns its 1 operand (name index)", () => {
		const bytes = new Uint8Array([OpCode.STORE_GLOBAL_VAR, 9, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.STORE_GLOBAL_VAR, bytes, 0)).toEqual([9]);
	});

	test("regression guard: CALL_BUILTIN still returns its existing 2 operands", () => {
		const bytes = new Uint8Array([OpCode.CALL_BUILTIN, 4, 1, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.CALL_BUILTIN, bytes, 0)).toEqual([4, 1]);
	});

	test("regression guard: an opcode outside every operand-bearing range still reports zero operands", () => {
		const bytes = new Uint8Array([OpCode.ADD, OpCode.HALT]);
		expect(decodeOpcodeArgs(OpCode.ADD, bytes, 0)).toEqual([]);
	});
});
