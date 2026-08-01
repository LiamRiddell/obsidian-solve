import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, BIGINT_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";


import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { ValueType } from "@solve-js/vm/Value";

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
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(BIGINT_PACKAGE, registry);
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
  return unwrapEvalResult(result);
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

  test("bigint bitwise XOR: 5n xor 3n = 6", () => {
    const r = parseAndExecute("5n xor 3n");
    expect(r.type).toBe(ValueType.BigInt);
    expect(Number(r.value)).toBe(6);
  });

  test("bigint exponentiation: 2n ^ 3n = 8 (returns Number)", () => {
    const r = parseAndExecute("2n ^ 3n");
    // Exponentiation on BigInt may return a Number type
    expect(r.toNumber()).toBe(8);
  });

  test("bigint exponent keyword: 2n prime 3n = 8 (returns Number)", () => {
    const r = parseAndExecute("2n prime 3n");
    expect(r.toNumber()).toBe(8);
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
