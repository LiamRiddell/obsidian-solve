import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@/engine/lexer/Lexer";
import { TokenTypes } from "@/engine/lexer/Token";
import { Parser } from "@/engine/parser/Parser";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { registerArithmeticParselets } from "@/providers/arithmetic/parselets/index";
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

describe("Arithmetic Parselets", () => {
  test("parses literal number", () => {
    expect(parseAndExecute("42")).toBe(42);
  });

  test("parses decimal number", () => {
    expect(parseAndExecute("3.14")).toBeCloseTo(3.14);
  });

  test("parses addition", () => {
    expect(parseAndExecute("1 + 2")).toBe(3);
  });

  test("parses subtraction", () => {
    expect(parseAndExecute("10 - 3")).toBe(7);
  });

  test("parses multiplication", () => {
    expect(parseAndExecute("4 * 5")).toBe(20);
  });

  test("parses division", () => {
    expect(parseAndExecute("10 / 2")).toBe(5);
  });

  test("parses exponent", () => {
    expect(parseAndExecute("2 ^ 3")).toBe(8);
  });

  test("parses modulo via mod keyword", () => {
    expect(parseAndExecute("10 mod 3")).toBe(1);
  });

  test("parses unary minus", () => {
    expect(parseAndExecute("-5")).toBe(-5);
  });

  test("parses unary plus", () => {
    expect(parseAndExecute("+5")).toBe(5);
  });

  test("parses parentheses", () => {
    expect(parseAndExecute("(1 + 2) * 3")).toBe(9);
  });

  test("parses nested parentheses", () => {
    expect(parseAndExecute("((2 + 3))")).toBe(5);
  });

  test("operator precedence: multiplication before addition", () => {
    expect(parseAndExecute("1 + 2 * 3")).toBe(7);
  });

  test("operator precedence: exponent before multiplication", () => {
    expect(parseAndExecute("2 * 3 ^ 2")).toBe(18);
  });

  test("unary minus with parentheses", () => {
    expect(parseAndExecute("-(5 + 3)")).toBe(-8);
  });

  test("constant pi", () => {
    expect(parseAndExecute("pi")).toBeCloseTo(Math.PI);
  });

  test("keyword addition: 'plus'", () => {
    expect(parseAndExecute("1 plus 2")).toBe(3);
  });

  test("keyword addition: 'add'", () => {
    expect(parseAndExecute("1 add 2")).toBe(3);
  });

  test("keyword subtraction: 'minus'", () => {
    expect(parseAndExecute("10 minus 3")).toBe(7);
  });

  test("keyword multiplication: 'times'", () => {
    expect(parseAndExecute("4 times 5")).toBe(20);
  });

  test("keyword division: 'divide'", () => {
    expect(parseAndExecute("10 divide 2")).toBe(5);
  });

  test("keyword exponent: 'to the power of'", () => {
    expect(parseAndExecute("2 to the power of 3")).toBe(8);
  });

  test("keyword modulo: 'mod'", () => {
    expect(parseAndExecute("10 mod 3")).toBe(1);
  });

  test("chained same-precedence operators: left associative", () => {
    expect(parseAndExecute("10 - 3 - 2")).toBe(5);
  });

  test("mixed operators with parentheses", () => {
    expect(parseAndExecute("(4 + 3) * 2 ^ 2 - 10 / 2")).toBe(23);
  });

  test("negative result", () => {
    expect(parseAndExecute("3 - 10")).toBe(-7);
  });

  test("float arithmetic", () => {
    expect(parseAndExecute("0.1 + 0.2")).toBeCloseTo(0.3, 10);
  });
});