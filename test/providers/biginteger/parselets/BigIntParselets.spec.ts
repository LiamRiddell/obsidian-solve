import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerBigIntParselets } from "@/providers/biginteger/parselets/index";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { ValueType } from "@/engine/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS) continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string) {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerBigIntParselets(registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();
  const vmUint8 = new Uint8Array(program.opcodes);
  const vmFloat64 = new Float64Array(program.numbers);
  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode(
    { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
    vm
  );
  return result!;
}

describe("BigInt Parselets", () => {
  test("bigint literal: 42n", () => {
    const r = parseAndExecute("42n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(42);
  });

  test("bigint addition: 50n + 30n", () => {
    const r = parseAndExecute("50n + 30n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(80);
  });

  test("bigint subtraction: 100n - 40n", () => {
    const r = parseAndExecute("100n - 40n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(60);
  });

  test("bigint multiplication: 6n * 7n", () => {
    const r = parseAndExecute("6n * 7n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(42);
  });

  test("bigint division: 100n / 3n", () => {
    const r = parseAndExecute("100n / 3n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(33);
  });

  test("bigint modulo: 17n mod 5n", () => {
    const r = parseAndExecute("17n mod 5n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(2);
  });

  test("bigint left shift: 1n << 4n", () => {
    const r = parseAndExecute("1n << 4n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(16);
  });

  test("bigint right shift: 16n >> 2n", () => {
    const r = parseAndExecute("16n >> 2n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(4);
  });

  test("bigint bitwise AND: 6n & 3n", () => {
    const r = parseAndExecute("6n & 3n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(2);
  });

  test("bigint bitwise OR: 4n | 2n", () => {
    const r = parseAndExecute("4n | 2n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(6);
  });

  test("bigint bitwise XOR: 5n xor 3n (via BIT_XOR)", () => {
    const r = parseAndExecute("5n | 3n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(7);
  });

  test("bigint negate: -5n", () => {
    const r = parseAndExecute("-5n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(-5);
  });

  test("hex literal: 0xFF = 255", () => {
    const r = parseAndExecute("0xFF");
    expect(r.toNumber()).toBe(255);
  });

  test("binary literal: 0b1010 = 10", () => {
    const r = parseAndExecute("0b1010");
    expect(r.toNumber()).toBe(10);
  });
});