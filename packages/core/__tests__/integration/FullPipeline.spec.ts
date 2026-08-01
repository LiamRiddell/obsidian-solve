/**
 * Full Pipeline Integration Tests
 *
 * End-to-end tests covering the entire pipeline:
 * Lexer -> Parser -> BytecodeBuilder -> VM execution.
 * Tests BODMAS precedence, parentheses, unary ops,
 * function calls, constants, keywords, bitwise, hex, and percentages.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, BIGINT_PACKAGE, FUNCTION_PACKAGE, PERCENTAGE_PACKAGE, VARIABLES_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";





function fullEval(expression: string): number {
  const lexer = new Lexer();
  const reg = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, reg);
  registerPackageForTesting(PERCENTAGE_PACKAGE, reg);
  registerPackageForTesting(FUNCTION_PACKAGE, reg);
  registerPackageForTesting(VARIABLES_PACKAGE, reg);
  const parser = new Parser(reg);

  const tokens: any[] = [];
  lexer.reset(expression);
  for (const t of lexer) {
    if (t.type === "WS") continue;
    tokens.push(t);
  }

  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();

  const vm = createVM(sharedOpRegistry);
  const result = executeBytecode({
    opcodes: new Uint8Array(program.opcodes),
    numbers: new Float64Array(program.numbers),
    strings: program.strings,
  }, vm);

  return unwrapEvalResult(result).toNumber();
}

describe("Full pipeline: Lexer → Parser → BytecodeBuilder → VM", () => {
  test("simple integer addition", () => {
    expect(fullEval("1 + 2")).toBe(3);
  });

  test("operator precedence: 2 + 3 * 4", () => {
    expect(fullEval("2 + 3 * 4")).toBe(14);
  });

  test("parentheses override precedence: (2 + 3) * 4", () => {
    expect(fullEval("(2 + 3) * 4")).toBe(20);
  });

  test("subtraction", () => {
    expect(fullEval("10 - 3")).toBe(7);
  });

  test("multiplication", () => {
    expect(fullEval("6 * 7")).toBe(42);
  });

  test("division", () => {
    expect(fullEval("10 / 3")).toBeCloseTo(3.333, 2);
  });

  test("modulo (mod keyword)", () => {
    expect(fullEval("10 mod 3")).toBe(1);
  });

  test("exponentiation", () => {
    expect(fullEval("2 ^ 3")).toBe(8);
  });

  test("negation", () => {
    expect(fullEval("-5")).toBe(-5);
  });

  test("function call: sqrt(16)", () => {
    expect(fullEval("sqrt(16)")).toBeCloseTo(4);
  });

  test("function call: abs(-5)", () => {
    expect(fullEval("abs(-5)")).toBe(5);
  });

  test("nested function calls", () => {
    const val = fullEval("sqrt(abs(-16))");
    expect(val).toBeCloseTo(4);
  });

  test("pi constant", () => {
    expect(fullEval("pi")).toBeCloseTo(Math.PI);
  });

  test("e constant", () => {
    expect(fullEval("e")).toBeCloseTo(Math.E);
  });

  test("keyword plus", () => {
    expect(fullEval("1 plus 2")).toBe(3);
  });

  test("keyword times", () => {
    expect(fullEval("3 times 4")).toBe(12);
  });

  test("chained operations", () => {
    expect(fullEval("1 + 2 + 3 + 4")).toBe(10);
  });

  test("complex expression", () => {
    expect(fullEval("2 * (3 + 4) - 5 ^ 2")).toBe(-11);
  });

  // Issue #82: Function calls must produce correct numeric values
  test("round(55/5) returns 11", () => {
    expect(fullEval("round(55/5)")).toBe(11);
  });

  test("sin(pi/2) returns 1", () => {
    expect(fullEval("sin(pi/2)")).toBeCloseTo(1, 10);
  });

  test("sin(pi/2)*2 returns 2", () => {
    expect(fullEval("sin(pi/2)*2")).toBeCloseTo(2, 10);
  });

  // --- BODMAS/Order of Operations exhaustive ---

  test("BODMAS tier 1: 2 ^ 3 = 8", () => {
    expect(fullEval("2 ^ 3")).toBe(8);
  });

  test("BODMAS tier 2: 3 * 4 = 12", () => {
    expect(fullEval("3 * 4")).toBe(12);
  });

  test("BODMAS tier 2: 10 / 2 = 5", () => {
    expect(fullEval("10 / 2")).toBe(5);
  });

  test("BODMAS tier 2: 10 % 3 = 0.1 (percentage operator)", () => {
    expect(fullEval("10 % 3")).toBeCloseTo(0.1);
  });

  test("BODMAS tier 3: 1 + 2 = 3", () => {
    expect(fullEval("1 + 2")).toBe(3);
  });

  test("BODMAS tier 3: 10 - 4 = 6", () => {
    expect(fullEval("10 - 4")).toBe(6);
  });

  test("BODMAS: exponent before multiply: 2 * 3 ^ 2 = 18", () => {
    expect(fullEval("2 * 3 ^ 2")).toBe(18);
  });

  test("BODMAS: exponent before divide: 100 / 5 ^ 2 = 4", () => {
    expect(fullEval("100 / 5 ^ 2")).toBe(4);
  });

  test("BODMAS: multiply before add: 2 + 3 * 4 = 14", () => {
    expect(fullEval("2 + 3 * 4")).toBe(14);
  });

  test("BODMAS: divide before subtract: 10 - 6 / 2 = 7", () => {
    expect(fullEval("10 - 6 / 2")).toBe(7);
  });

  test("BODMAS: modulo via keyword: 10 mod 3 = 1", () => {
    expect(fullEval("10 mod 3")).toBe(1);
  });

  test("BODMAS: percent in expression: 10 + 10% = 10.1", () => {
    expect(fullEval("10 + 10%")).toBeCloseTo(10.1);
  });

  test("BODMAS: parentheses before exp: (2 + 3) ^ 2 = 25", () => {
    expect(fullEval("(2 + 3) ^ 2")).toBe(25);
  });

  test("BODMAS: nested parens: ((2 + 3) * 4) ^ 2 = 400", () => {
    expect(fullEval("((2 + 3) * 4) ^ 2")).toBe(400);
  });

  test("BODMAS: deep nesting: ((((1 + 2)))) = 3", () => {
    expect(fullEval("((((1 + 2))))")).toBe(3);
  });

  test("BODMAS: unary minus applies to whole product: -(3 * 4) = -12", () => {
    expect(fullEval("-(3 * 4)")).toBe(-12);
  });

  test("BODMAS: double unary: --5 = 5", () => {
    expect(fullEval("--5")).toBe(5);
  });

  test("BODMAS: unary plus then minus: -+5 = -5", () => {
    expect(fullEval("-+5")).toBe(-5);
  });

  test("BODMAS: large expression: (1 + 2) * 3 ^ 2 - 4 / 2 = 25", () => {
    expect(fullEval("(1 + 2) * 3 ^ 2 - 4 / 2")).toBe(25);
  });

  test("BODMAS: chained addition: 1 + 2 + 3 + 4 + 5 = 15", () => {
    expect(fullEval("1 + 2 + 3 + 4 + 5")).toBe(15);
  });

  test("BODMAS: chained multiplication: 2 * 3 * 4 = 24", () => {
    expect(fullEval("2 * 3 * 4")).toBe(24);
  });

  test("BODMAS: chained subtraction left-assoc: 10 - 3 - 2 = 5", () => {
    expect(fullEval("10 - 3 - 2")).toBe(5);
  });

  test("BODMAS: chained division left-assoc: 100 / 5 / 2 = 10", () => {
    expect(fullEval("100 / 5 / 2")).toBe(10);
  });

  test("BODMAS: mixed with word keywords: 2 plus 3 times 4 = 14", () => {
    expect(fullEval("2 plus 3 times 4")).toBe(14);
  });

  test("BODMAS: word keywords with parens: (2 plus 3) times 4 = 20", () => {
    expect(fullEval("(2 plus 3) times 4")).toBe(20);
  });

  test("BODMAS: reduce: 0.1 + 0.2", () => {
    expect(fullEval("0.1 + 0.2")).toBeCloseTo(0.3, 10);
  });

  test("BODMAS: fp multiplication then addition: 0.5 * 2 + 1 = 2", () => {
    expect(fullEval("0.5 * 2 + 1")).toBe(2);
  });

  test("BODMAS: expression with hex: 0xFF + 1 = 256", () => {
    const lexer = new Lexer();
    const registry = new ParseletRegistry();
    registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
    registerPackageForTesting(BIGINT_PACKAGE, registry);
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens: any[] = [];
    lexer.reset("0xFF + 1");
    for (const t of lexer) {
      if (t.type === "WS") continue;
      tokens.push(t);
    }
    parser.load(tokens);
    parser.parseExpression(0, builder);
    const program = builder.build();
    const vmUint8 = new Uint8Array(program.opcodes);
    const vmFloat64 = new Float64Array(program.numbers);
    const vm = createVM(sharedOpRegistry);
    const result = executeBytecode({ opcodes: vmUint8, numbers: vmFloat64, strings: program.strings }, vm);
    expect(unwrapEvalResult(result).toNumber()).toBe(256);
  });

  test("BODMAS: function precedence: sqrt(9) * 2 = 6", () => {
    expect(fullEval("sqrt(9) * 2")).toBe(6);
  });

  test("BODMAS: function arg contains expression: sqrt(4 + 5) = 3", () => {
    expect(fullEval("sqrt(4 + 5)")).toBe(3);
  });

  test("BODMAS: multiple functions: ceil(floor(4.7)) = 4", () => {
    expect(fullEval("ceil(floor(4.7))")).toBe(4);
  });

  test("BODMAS: pi in expressions: pi * 2", () => {
    expect(fullEval("pi * 2")).toBeCloseTo(Math.PI * 2);
  });

  test("BODMAS: e in expressions: e + 1", () => {
    expect(fullEval("e + 1")).toBeCloseTo(Math.E + 1);
  });

  test("BODMAS: pi * e", () => {
    expect(fullEval("pi * e")).toBeCloseTo(Math.PI * Math.E);
  });

  test("BODMAS: percent precedence: 10 + 10% of 6 + 2 = 12.6", () => {
    expect(fullEval("10 + 10% of 6 + 2")).toBeCloseTo(12.6);
  });

  test("BODMAS: bitwise AND precedence: (2 + 3) & 4 = 4", () => {
    expect(fullEval("(2 + 3) & 4")).toBe(4);
  });

  test("BODMAS: bitwise OR precedence: (2 + 3) | 1 = 5", () => {
    expect(fullEval("(2 + 3) | 1")).toBe(5);
  });

  test("BODMAS: shift precedence: (2 + 3) << 1 = 10", () => {
    expect(fullEval("(2 + 3) << 1")).toBe(10);
  });
});
