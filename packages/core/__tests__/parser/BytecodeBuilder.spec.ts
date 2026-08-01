import { describe, expect, test } from "@jest/globals";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

describe("BytecodeBuilder", () => {
  test("build produces empty program", () => {
    const builder = new BytecodeBuilder();
    const program = builder.build();
    expect(program.opcodes.length).toBe(0);
    expect(program.numbers.length).toBe(0);
    expect(program.strings).toEqual([]);
  });

  test("emitOpcode appends opcode", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.opcodes.length).toBe(1);
    expect(program.opcodes[0]).toBe(OpCode.HALT);
  });

  test("emitNumber adds number and pushes its index to opcodes", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(3.14);
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.numbers.length).toBe(1);
    expect(program.numbers[0]).toBeCloseTo(3.14);
    expect(program.opcodes.length).toBe(3);
    expect(program.opcodes[0]).toBe(OpCode.PUSH_NUMBER);
    expect(program.opcodes[1]).toBe(0);
    expect(program.opcodes[2]).toBe(OpCode.HALT);
  });

  test("emitString adds string and pushes its index to opcodes", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("hello");
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.strings).toEqual(["hello"]);
    expect(program.opcodes.length).toBe(3);
    expect(program.opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(program.opcodes[1]).toBe(0);
    expect(program.opcodes[2]).toBe(OpCode.HALT);
  });

  test("emitIndex appends integer index", () => {
    const builder = new BytecodeBuilder();
    builder.emitIndex(5);
    builder.emitIndex(42);
    const program = builder.build();
    expect(program.opcodes.length).toBe(2);
    expect(program.opcodes[0]).toBe(5);
    expect(program.opcodes[1]).toBe(42);
  });

  test("PUSH_NUMBER followed by HALT produces correct bytecode", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(42);
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.opcodes.length).toBe(3);
    expect(program.opcodes[0]).toBe(OpCode.PUSH_NUMBER);
    expect(program.opcodes[1]).toBe(0);
    expect(program.opcodes[2]).toBe(OpCode.HALT);
    expect(program.numbers.length).toBe(1);
    expect(program.numbers[0]).toBe(42);
  });

  test("multiple numbers and strings interleaved", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(10);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("foo");
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(20);
    builder.emitOpcode(OpCode.HALT);

    const program = builder.build();
    const expectedOpcodes = [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.PUSH_NUMBER, 1, OpCode.HALT];
    expect(program.opcodes.length).toBe(expectedOpcodes.length);
    for (let i = 0; i < expectedOpcodes.length; i++) {
      expect(program.opcodes[i]).toBe(expectedOpcodes[i]);
    }
    expect(program.numbers.length).toBe(2);
    expect(program.numbers[0]).toBe(10);
    expect(program.numbers[1]).toBe(20);
    expect(program.strings).toEqual(["foo"]);
  });

  test("large program stress test", () => {
    const builder = new BytecodeBuilder();
    for (let i = 0; i < 100; i++) {
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(i);
    }
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.opcodes.length).toBe(201); // 100 PUSH_NUMBER + 100 indices + 1 HALT
    expect(program.numbers.length).toBe(100);
    expect(program.numbers[99]).toBe(99);
  });

  // Regression: the compiled opcode stream is a Uint8Array, so a constant
  // index above 255 used to silently wrap (e.g. index 300 read back as 44)
  // instead of erroring — a real, silent-wrong-answer bug for expressions
  // with many distinct numeric literals under a raised maxComplexity. These
  // pin the fix: exceeding the pool now throws instead of wrapping.
  describe("constant pool overflow (256-entry Uint8Array limit)", () => {
    test("256 distinct numeric literals build successfully (exactly at the limit)", () => {
      const builder = new BytecodeBuilder();
      for (let i = 0; i < 256; i++) {
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(i);
      }
      const program = builder.build();
      expect(program.numbers.length).toBe(256);
      expect(program.opcodes[511]).toBe(255); // last index, unwrapped
    });

    test("257th distinct numeric literal throws instead of silently wrapping the index", () => {
      const builder = new BytecodeBuilder();
      expect(() => {
        for (let i = 0; i < 257; i++) {
          builder.emitOpcode(OpCode.PUSH_NUMBER);
          builder.emitNumber(i);
        }
      }).toThrow(/numeric literals/);
    });

    test("256 distinct string literals build successfully (exactly at the limit)", () => {
      const builder = new BytecodeBuilder();
      for (let i = 0; i < 256; i++) {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(`s${i}`);
      }
      const program = builder.build();
      expect(program.strings.length).toBe(256);
    });

    test("257th distinct string literal throws instead of silently wrapping the index", () => {
      const builder = new BytecodeBuilder();
      expect(() => {
        for (let i = 0; i < 257; i++) {
          builder.emitOpcode(OpCode.PUSH_STRING);
          builder.emitString(`s${i}`);
        }
      }).toThrow(/string literals/);
    });

    test("repeating the SAME string past 256 other distinct strings never throws (deduplicated)", () => {
      const builder = new BytecodeBuilder();
      for (let i = 0; i < 300; i++) {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString("shared"); // always the same string — one pool entry, reused every time
      }
      expect(() => builder.build()).not.toThrow();
    });
  });
});
