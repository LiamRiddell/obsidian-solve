/**
 * VM — Core Opcode Tests
 *
 * Verifies each opcode handler in isolation via hand-crafted bytecode:
 * - Stack ops: PUSH_NUMBER, PUSH_STRING, PUSH_BOOLEAN, PUSH_BIGINT, PUSH_HEX
 * - Arithmetic: ADD, SUB, MUL, DIV, MOD, EXP, NEG, POS
 * - Matrix: MAT_NEW
 * - Variable: LOAD_VAR, STORE_VAR
 * - Builtins: CALL_BUILTIN (sqrt, abs, min, max, diceRoll)
 * - Control: HALT, NOP, DATE_NOW
 */

import { describe, expect, test } from "@jest/globals";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";

function bc(ops: number[], numbers: number[] = [], strings: string[] = []): { opcodes: Uint8Array; numbers: Float64Array; strings: string[] } {
  return {
    opcodes: new Uint8Array(ops),
    numbers: new Float64Array(numbers),
    strings,
  };
}

describe("VM executeBytecode", () => {
  test("HALT returns top of stack", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.HALT], [42]), vm);
    expect(result).toBeDefined();
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("NOP does nothing", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.NOP, OpCode.PUSH_NUMBER, 0, OpCode.HALT], [42]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("PUSH_NUMBER pushes a number", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.HALT], [3.14]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(3.14);
  });

  test("PUSH_STRING pushes a string", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_STRING, 0, OpCode.HALT], [], ["hello"]), vm);
    expect(unwrapEvalResult(result).value).toBe("hello");
  });

  test("PUSH_BOOLEAN pushes true/false", () => {
    const vm = createVM(sharedOpRegistry);
    const r1 = executeBytecode(bc([OpCode.PUSH_BOOLEAN, 1, OpCode.HALT]), vm);
    expect(unwrapEvalResult(r1).value).toBe(true);
    const vm2 = createVM(sharedOpRegistry);
    const r2 = executeBytecode(bc([OpCode.PUSH_BOOLEAN, 0, OpCode.HALT]), vm2);
    expect(unwrapEvalResult(r2).value).toBe(false);
  });

  test("ADD", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.ADD, OpCode.HALT], [10, 20]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(30);
  });

  test("SUB", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.SUB, OpCode.HALT], [20, 5]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(15);
  });

  test("MUL", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.MUL, OpCode.HALT], [6, 7]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("DIV", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.DIV, OpCode.HALT], [10, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(3.333, 2);
  });

  test("MOD", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.MOD, OpCode.HALT], [10, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(1);
  });

  test("EXP", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.EXP, OpCode.HALT], [2, 3]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(8);
  });

  test("NEG negates", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.NEG, OpCode.HALT], [42]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(-42);
  });

  test("POS is identity", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.POS, OpCode.HALT], [42]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(42);
  });

  test("DATE_NOW pushes current timestamp", () => {
    const vm = createVM(sharedOpRegistry);
    const before = Date.now();
    const result = executeBytecode(bc([OpCode.DATE_NOW, OpCode.HALT]), vm);
    const after = Date.now();
    expect(unwrapEvalResult(result).type).toBe(ValueType.Datetime);
    expect((unwrapEvalResult(result).value as number)).toBeGreaterThanOrEqual(before);
    expect((unwrapEvalResult(result).value as number)).toBeLessThanOrEqual(after);
  });

  test("CALL_BUILTIN diceRoll returns within range", () => {
    for (let i = 0; i < 50; i++) {
      const vm = createVM(sharedOpRegistry);
      const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 37, 2, OpCode.HALT], [1, 6]), vm);
      const val = unwrapEvalResult(result).toNumber();
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  test("MAT_NEW creates a 1x3 row-vector matrix from components", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.MAT_NEW, 1, 3, OpCode.HALT], [10, 20, 30]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Matrix);
    expect((unwrapEvalResult(result).value as MatrixData).data).toEqual([10, 20, 30]);
  });

  test("LOAD_VAR and STORE_VAR round-trip", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0, OpCode.LOAD_VAR, 0, OpCode.HALT], [99], ["x"]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(99);
  });

  test("LOAD_VAR throws for undefined variable", () => {
    const vm = createVM(sharedOpRegistry);
    expect(() => {
      unwrapEvalResult(executeBytecode(bc([OpCode.LOAD_VAR, 0, OpCode.HALT], [], ["undefined_var"]), vm));
    }).toThrow(/Undefined variable: undefined_var/);
  });

  test("CALL_BUILTIN sqrt(16)", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 0, 1, OpCode.HALT], [16]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBeCloseTo(4);
  });

  test("CALL_BUILTIN abs(-5)", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.CALL_BUILTIN, 1, 1, OpCode.HALT], [-5]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(5);
  });

  test("CALL_BUILTIN min(3,7,1) = 1", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.CALL_BUILTIN, 9, 3, OpCode.HALT], [3, 7, 1]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(1);
  });

  test("CALL_BUILTIN max(3,7,1) = 7", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.CALL_BUILTIN, 10, 3, OpCode.HALT], [3, 7, 1]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(7);
  });

  test("PUSH_BIGINT", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_BIGINT, 0, OpCode.HALT], [], ["9007199254740991"]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.BigInt);
    expect(unwrapEvalResult(result).value).toEqual(BigInt(9007199254740991));
  });

  test("PUSH_HEX", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_HEX, 0, OpCode.HALT], [255]), vm);
    expect(unwrapEvalResult(result).type).toBe(ValueType.Hex);
    expect(unwrapEvalResult(result).toNumber()).toBe(255);
  });

  test("complex expression: 2 + 3 * 4 = 14", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode(bc([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.MUL, OpCode.ADD, OpCode.HALT], [2, 3, 4]), vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(14);
  });
});
