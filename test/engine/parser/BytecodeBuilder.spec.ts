import { describe, expect, test } from "@jest/globals";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

describe("BytecodeBuilder", () => {
  test("build produces empty program", () => {
    const builder = new BytecodeBuilder();
    const program = builder.build();
    expect(program.opcodes).toEqual([]);
    expect(program.numbers).toEqual([]);
    expect(program.strings).toEqual([]);
  });

  test("emitOpcode appends opcode", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.opcodes).toEqual([OpCode.HALT]);
  });

  test("emitNumber adds number and pushes its index to opcodes", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(3.14);
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.numbers).toEqual([3.14]);
    expect(program.opcodes).toEqual([OpCode.PUSH_NUMBER, 0, OpCode.HALT]);
  });

  test("emitString adds string and pushes its index to opcodes", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString("hello");
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.strings).toEqual(["hello"]);
    expect(program.opcodes).toEqual([OpCode.PUSH_STRING, 0, OpCode.HALT]);
  });

  test("emitIndex appends integer index", () => {
    const builder = new BytecodeBuilder();
    builder.emitIndex(5);
    builder.emitIndex(42);
    const program = builder.build();
    expect(program.opcodes).toEqual([5, 42]);
  });

  test("PUSH_NUMBER followed by HALT produces correct bytecode", () => {
    const builder = new BytecodeBuilder();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(42);
    builder.emitOpcode(OpCode.HALT);
    const program = builder.build();
    expect(program.opcodes).toEqual([OpCode.PUSH_NUMBER, 0, OpCode.HALT]);
    expect(program.numbers).toEqual([42]);
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
    expect(program.opcodes).toEqual([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.PUSH_NUMBER, 1, OpCode.HALT]);
    expect(program.numbers).toEqual([10, 20]);
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
});
