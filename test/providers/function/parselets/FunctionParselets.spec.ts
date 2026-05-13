import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@/providers/function/parselets/index";
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

function parseAndExecute(input: string): number {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerFunctionParselets(registry);
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
  expect(result!.type).toBe(ValueType.Number);
  return result!.toNumber();
}

describe("Function Parselets", () => {
  test("sqrt(16)", () => {
    expect(parseAndExecute("sqrt(16)")).toBe(4);
  });

  test("abs(-5)", () => {
    expect(parseAndExecute("abs(-5)")).toBe(5);
  });

  test("sin(0)", () => {
    expect(parseAndExecute("sin(0)")).toBeCloseTo(0);
  });

  test("cos(0)", () => {
    expect(parseAndExecute("cos(0)")).toBeCloseTo(1);
  });

  test("ceil(3.3)", () => {
    expect(parseAndExecute("ceil(3.3)")).toBe(4);
  });

  test("floor(3.7)", () => {
    expect(parseAndExecute("floor(3.7)")).toBe(3);
  });

  test("round(3.7)", () => {
    expect(parseAndExecute("round(3.7)")).toBe(4);
  });

  test("log(100)", () => {
    expect(parseAndExecute("log(100)")).toBeCloseTo(Math.log(100));
  });

  test("tan(0)", () => {
    expect(parseAndExecute("tan(0)")).toBeCloseTo(0);
  });

  test("asin(0)", () => {
    expect(parseAndExecute("asin(0)")).toBeCloseTo(0);
  });

  test("acos(1)", () => {
    expect(parseAndExecute("acos(1)")).toBeCloseTo(0);
  });

  test("atan(0)", () => {
    expect(parseAndExecute("atan(0)")).toBeCloseTo(0);
  });

  test("atan2(1, 1)", () => {
    expect(parseAndExecute("atan2(1, 1)")).toBeCloseTo(Math.PI / 4);
  });

  test("sinh(0)", () => {
    expect(parseAndExecute("sinh(0)")).toBeCloseTo(0);
  });

  test("cosh(0)", () => {
    expect(parseAndExecute("cosh(0)")).toBeCloseTo(1);
  });

  test("tanh(0)", () => {
    expect(parseAndExecute("tanh(0)")).toBeCloseTo(0);
  });

  test("asinh(0)", () => {
    expect(parseAndExecute("asinh(0)")).toBeCloseTo(0);
  });

  test("acosh(1)", () => {
    expect(parseAndExecute("acosh(1)")).toBeCloseTo(0);
  });

  test("atanh(0)", () => {
    expect(parseAndExecute("atanh(0)")).toBeCloseTo(0);
  });

  test("cbrt(27)", () => {
    expect(parseAndExecute("cbrt(27)")).toBe(3);
  });

  test("clz32(1)", () => {
    expect(parseAndExecute("clz32(1)")).toBe(31);
  });

  test("expm1(0)", () => {
    expect(parseAndExecute("expm1(0)")).toBeCloseTo(0);
  });

  test("exp(1)", () => {
    expect(parseAndExecute("exp(1)")).toBeCloseTo(Math.E);
  });

  test("fround(1.5)", () => {
    expect(parseAndExecute("fround(1.5)")).toBeCloseTo(1.5);
  });

  test("hypot(3, 4)", () => {
    expect(parseAndExecute("hypot(3, 4)")).toBe(5);
  });

  test("imul(2, 3)", () => {
    expect(parseAndExecute("imul(2, 3)")).toBe(6);
  });

  test("log10(100)", () => {
    expect(parseAndExecute("log10(100)")).toBe(2);
  });

  test("log1p(0)", () => {
    expect(parseAndExecute("log1p(0)")).toBeCloseTo(0);
  });

  test("log2(8)", () => {
    expect(parseAndExecute("log2(8)")).toBe(3);
  });

  test("pow(2, 3)", () => {
    expect(parseAndExecute("pow(2, 3)")).toBe(8);
  });

  test("sign(-42)", () => {
    expect(parseAndExecute("sign(-42)")).toBe(-1);
  });

  test("sign(0)", () => {
    expect(parseAndExecute("sign(0)")).toBe(0);
  });

  test("sign(42)", () => {
    expect(parseAndExecute("sign(42)")).toBe(1);
  });

  test("trunc(3.7)", () => {
    expect(parseAndExecute("trunc(3.7)")).toBe(3);
  });

  test("deg2rad via degtorad(180)", () => {
    expect(parseAndExecute("degtorad(180)")).toBeCloseTo(Math.PI);
  });

  test("rad2deg via radtodeg(pi)", () => {
    expect(parseAndExecute("radtodeg(pi)")).toBeCloseTo(180);
  });

  test("function in exponent: 2 ^ sqrt(9) = 8", () => {
    expect(parseAndExecute("2 ^ sqrt(9)")).toBe(8);
  });

  test("function in multiplication: sqrt(25) * 2 = 10", () => {
    expect(parseAndExecute("sqrt(25) * 2")).toBe(10);
  });

  test("function in addition: abs(-5) + 3 = 8", () => {
    expect(parseAndExecute("abs(-5) + 3")).toBe(8);
  });

  test("nested function: sqrt(abs(-16))", () => {
    expect(parseAndExecute("sqrt(abs(-16))")).toBe(4);
  });

  test("function in expression: sqrt(9) + 1", () => {
    expect(parseAndExecute("sqrt(9) + 1")).toBe(4);
  });

  test("min with two args: min(3, 7)", () => {
    expect(parseAndExecute("min(3, 7)")).toBe(3);
  });

  test("min with three args: min(9, 3, 7)", () => {
    expect(parseAndExecute("min(9, 3, 7)")).toBe(3);
  });

  test("max with two args: max(3, 7)", () => {
    expect(parseAndExecute("max(3, 7)")).toBe(7);
  });

  test("max with three args: max(9, 3, 7)", () => {
    expect(parseAndExecute("max(9, 3, 7)")).toBe(9);
  });

  test("unknown function throws error", () => {
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens = [
      { type: "IDENT", value: "unknownFunc", text: "unknownFunc", offset: 0, lineBreaks: 0, line: 1, col: 1 },
      { type: "LPAREN", value: "(", text: "(", offset: 11, lineBreaks: 0, line: 1, col: 12 },
      { type: "NUMBER", value: "42", text: "42", offset: 12, lineBreaks: 0, line: 1, col: 13 },
      { type: "RPAREN", value: ")", text: ")", offset: 14, lineBreaks: 0, line: 1, col: 15 },
    ];
    parser.load(tokens);
    expect(() => {
      parser.parseExpression(0, builder);
    }).toThrow();
  });
});