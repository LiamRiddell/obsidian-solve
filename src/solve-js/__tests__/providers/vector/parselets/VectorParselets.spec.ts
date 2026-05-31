/**
 * Vector Parselets — Package Integration Tests
 *
 * Full-pipeline tests for the vector package (vec2, vec3, vec4).
 * Verifies:
 * - ARR_NEW opcode produces ValueType.Array with correct dimensions
 * - Nested arithmetic expressions inside vector components
 * - Unary operators and exponentiation in components
 */

import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@solve-js/providers/arithmetic/parselets/index";
import { registerVectorParselets } from "@solve-js/providers/vector/parselets/index";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value } from "@solve-js/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): Value {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerVectorParselets(registry);
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

describe("Vector Parselets", () => {
  test("vec2(1, 2)", () => {
    const result = parseAndExecute("vec2(1, 2)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[]).length).toBe(2);
    expect((result.value as number[])[0]).toBe(1);
    expect((result.value as number[])[1]).toBe(2);
  });

  test("vec2 with expressions: vec2(1 + 2, 3 * 4)", () => {
    const result = parseAndExecute("vec2(1 + 2, 3 * 4)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(3);
    expect((result.value as number[])[1]).toBe(12);
  });

  test("vec3: vec3(1, 2, 3)", () => {
    const result = parseAndExecute("vec3(1, 2, 3)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[]).length).toBe(3);
  });

  test("vec4: vec4(1, 2, 3, 4)", () => {
    const result = parseAndExecute("vec4(1, 2, 3, 4)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[]).length).toBe(4);
  });

  test("nested arithmetic", () => {
    const result = parseAndExecute("vec2(10 * 2 / 4, 2)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(5);
    expect((result.value as number[])[1]).toBe(2);
  });

  test("vec2 with unary: vec2(-3, +5)", () => {
    const result = parseAndExecute("vec2(-3, +5)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(-3);
    expect((result.value as number[])[1]).toBe(5);
  });

  test("vec2 with exponent: vec2(3^2, 2^3)", () => {
    const result = parseAndExecute("vec2(3^2, 2^3)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(9);
    expect((result.value as number[])[1]).toBe(8);
  });

  test("vec3 with arithmetic: vec3(1+2, 3*4, 10/2)", () => {
    const result = parseAndExecute("vec3(1+2, 3*4, 10/2)");
    expect(result.isVector()).toBe(true);
    expect((result.value as number[])[0]).toBe(3);
    expect((result.value as number[])[1]).toBe(12);
    expect((result.value as number[])[2]).toBe(5);
  });
});
