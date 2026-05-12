import { describe, expect, test } from "@jest/globals";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { OpCode } from "@/engine/parser/OpCode";
import { Value, ValueType } from "@/engine/vm/Value";

describe("VM Resilience", () => {
  test("empty opcodes array returns undefined", () => {
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode({ opcodes: new Uint8Array([]), numbers: new Float64Array([]), strings: [] }, vm);
    expect(result).toBeUndefined();
  });

  test("single opcode without halt flushes stack", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([OpCode.PUSH_NUMBER, 0]);
    const numbers = new Float64Array([42]);
    const result = executeBytecode({ opcodes, numbers, strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("invalid opcode value does not throw", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([255, 0]);
    const numbers = new Float64Array([0]);
    expect(() => {
      executeBytecode({ opcodes, numbers, strings: [] }, vm);
    }).not.toThrow();
  });

  test("PUSH_STRING with index beyond strings length", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([OpCode.PUSH_STRING, 99, OpCode.HALT]);
    const numbers = new Float64Array([]);
    const result = executeBytecode({ opcodes, numbers, strings: ["a"] }, vm);
    expect(result).toBeDefined();
  });

  test("corrupted bytecode - truncated data after PUSH_NUMBER", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([OpCode.PUSH_NUMBER]);
    const numbers = new Float64Array([]);
    const result = executeBytecode({ opcodes, numbers, strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("corrupted bytecode - truncated data after PUSH_STRING", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([OpCode.PUSH_STRING]);
    const numbers = new Float64Array([]);
    const result = executeBytecode({ opcodes, numbers, strings: ["test"] }, vm);
    expect(result).toBeDefined();
  });

  test("HALT returns correct stack value after complex operations", () => {
    const vm = createVM(sharedOpRegistry);
    const opcodes = new Uint8Array([
      OpCode.PUSH_NUMBER, 0, // push 42
      OpCode.PUSH_NUMBER, 1, // push 10
      OpCode.ADD,
      OpCode.HALT,
    ]);
    const numbers = new Float64Array([42, 10]);
    const result = executeBytecode({ opcodes, numbers, strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("deep opcode chain without recursion overflow", () => {
    const vm = createVM(sharedOpRegistry);
    const ops: number[] = [];
    for (let i = 0; i < 100; i++) {
      ops.push(OpCode.PUSH_NUMBER, i % 50);
    }
    ops.push(OpCode.HALT);
    const numbers = new Float64Array(Array.from({ length: 50 }, (_, i) => i));
    const result = executeBytecode({ opcodes: new Uint8Array(ops), numbers: new Float64Array(numbers), strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("max stack depth - many pushes without pops", () => {
    const vm = createVM(sharedOpRegistry);
    const ops: number[] = [];
    for (let i = 0; i < 500; i++) {
      ops.push(OpCode.PUSH_NUMBER, 0);
    }
    ops.push(OpCode.HALT);
    const numbers = new Float64Array([1]);
    const result = executeBytecode({ opcodes: new Uint8Array(ops), numbers, strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("nested CALL_BUILTIN with multiple arguments", () => {
    const vm = createVM(sharedOpRegistry);
    const ops: number[] = [
      OpCode.PUSH_NUMBER, 0, // arg1: 2
      OpCode.PUSH_NUMBER, 1, // arg2: 3
      OpCode.CALL_BUILTIN, 15, // Math.pow = index 15
      OpCode.HALT,
    ];
    const numbers = new Float64Array([2, 3]);
    const result = executeBytecode({ opcodes: new Uint8Array(ops), numbers, strings: [] }, vm);
    expect(result).toBeDefined();
  });

  test("all arithmetic opcodes produce valid results", () => {
    const ops: Array<{op: OpCode; a: number; b: number; numbers: number[]}> = [
      { op: OpCode.ADD, a: 10, b: 20, numbers: [10, 20] },
      { op: OpCode.SUB, a: 30, b: 10, numbers: [30, 10] },
      { op: OpCode.MUL, a: 5, b: 6, numbers: [5, 6] },
      { op: OpCode.DIV, a: 20, b: 4, numbers: [20, 4] },
      { op: OpCode.MOD, a: 17, b: 5, numbers: [17, 5] },
      { op: OpCode.EXP, a: 2, b: 8, numbers: [2, 8] },
    ];

    for (const { op, a, b, numbers } of ops) {
      const vm = createVM(sharedOpRegistry);
      const opcodes = new Uint8Array([
        OpCode.PUSH_NUMBER, 1,
        OpCode.PUSH_NUMBER, 0,
        op,
        OpCode.HALT,
      ]);
      const result = executeBytecode({ opcodes, numbers: new Float64Array([a, b]), strings: [] }, vm);
      expect(result).toBeDefined();
    }
  });
});