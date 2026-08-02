/**
 * GroupParselet — grouping vs. bare-tuple vector literal
 *
 * `(expr)` is plain grouping for precedence. `(x, y)` / `(x, y, z)` /
 * `(x, y, z, w)` is the bare-tuple vector literal form documented as an
 * alternative to `vec2(...)`/`vec3(...)`/`vec4(...)` (wiki:
 * Arithmetic/Vector). Both forms share the LPAREN token and must be
 * handled by this single parselet — see GroupParselet.ts for why.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { ValueType, Value, type MatrixData } from "@solve-js/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS) continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string): Value {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
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

describe("GroupParselet — plain grouping (regression)", () => {
  test("(1 + 2) * 3 groups for precedence, still a Number", () => {
    const result = parseAndExecute("(1 + 2) * 3");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(9);
  });

  test("nested groups: ((2 + 3)) * 2", () => {
    const result = parseAndExecute("((2 + 3)) * 2");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(10);
  });

  test("single-element group is not treated as a tuple", () => {
    const result = parseAndExecute("(5)");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(5);
  });
});

describe("GroupParselet — bare-tuple vector literal", () => {
  test("(1, 2) produces a 2-component array", () => {
    const result = parseAndExecute("(1, 2)");
    expect(result.isMatrix()).toBe(true);
    expect((result.value as MatrixData).data).toEqual([1, 2]);
  });

  test("(1, 2, 3) produces a 3-component array", () => {
    const result = parseAndExecute("(1, 2, 3)");
    expect(result.isMatrix()).toBe(true);
    expect((result.value as MatrixData).data).toEqual([1, 2, 3]);
  });

  test("(1, 2, 3, 4) produces a 4-component array", () => {
    const result = parseAndExecute("(1, 2, 3, 4)");
    expect(result.isMatrix()).toBe(true);
    expect((result.value as MatrixData).data).toEqual([1, 2, 3, 4]);
  });

  test("components may be full expressions: (1 + 2, 3 * 4)", () => {
    const result = parseAndExecute("(1 + 2, 3 * 4)");
    expect(result.isMatrix()).toBe(true);
    expect((result.value as MatrixData).data).toEqual([3, 12]);
  });

  test("components may be unary/exponent expressions: (-3, 2^3)", () => {
    const result = parseAndExecute("(-3, 2^3)");
    expect(result.isMatrix()).toBe(true);
    expect((result.value as MatrixData).data).toEqual([-3, 8]);
  });
});
