import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { createVM, executeBytecode } from "@/engine/vm/VM";
import { sharedOpRegistry } from "@/engine/vm/OpRegistry";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
import { registerVariableParselets } from "@/providers/variables/parselets/index";

function fullEval(expression: string): number {
  const lexer = new Lexer();
  const reg = new ParseletRegistry();
  registerArithmeticParselets(reg);
  registerPercentageParselets(reg);
  registerFunctionParselets(reg);
  registerVariableParselets(reg);
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

  return result!.toNumber();
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
});
