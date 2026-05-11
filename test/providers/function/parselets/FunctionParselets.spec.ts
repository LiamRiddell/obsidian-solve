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