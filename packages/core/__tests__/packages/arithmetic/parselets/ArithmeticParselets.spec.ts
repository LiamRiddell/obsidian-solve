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
import { ValueType } from "@solve-js/vm/Value";
import { TokenNormalizer, implicitMultiplyRule, BUILTIN_PHRASES } from "@solve-js/normalizer";

/** Shared normalizer instance for phrase fusion */
const normalizer = new TokenNormalizer();
// Register built-in phrases into the PhraseTrie (single-pass O(depth) matching)
for (const [phrase, tokenType] of Object.entries(BUILTIN_PHRASES)) {
  normalizer.addPhrase(phrase, tokenType);
}
// Register implicit multiply rule with trie-backed phrase guard
normalizer.register(implicitMultiplyRule(
  50,
  (word) => normalizer.canStartPhrase(word),
));

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
  const rawTokens = tokenize(lexer, input);
  // Normalize tokens for phrase fusion (e.g., "to the power of" → CARET)
  const tokens = normalizer.normalize(rawTokens);
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
  const evalResult = executeBytecode(
    { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
    vm
  );
  const result = unwrapEvalResult(evalResult);
  expect(result.type).toBe(ValueType.Number);
  return result.toNumber();
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

  test("keyword addition: 'and'", () => {
    expect(parseAndExecute("1 and 2")).toBe(3);
  });

  test("keyword subtraction: 'minus'", () => {
    expect(parseAndExecute("10 minus 3")).toBe(7);
  });

  test("keyword subtraction: 'subtract'", () => {
    expect(parseAndExecute("10 subtract 3")).toBe(7);
  });

  test("keyword subtraction: 'remove'", () => {
    expect(parseAndExecute("10 remove 3")).toBe(7);
  });

  test("keyword subtraction: 'take'", () => {
    expect(parseAndExecute("10 take 3")).toBe(7);
  });

  test("keyword multiplication: 'times'", () => {
    expect(parseAndExecute("4 times 5")).toBe(20);
  });

  test("keyword multiplication: 'multiply'", () => {
    expect(parseAndExecute("4 multiply 5")).toBe(20);
  });

  test("keyword multiplication phrase 'times by'", () => {
    expect(parseAndExecute("4 times by 5")).toBe(20);
  });

  test("keyword multiplication phrase 'multiply by'", () => {
    expect(parseAndExecute("4 multiply by 5")).toBe(20);
  });

  test("keyword multiplication: 'times'", () => {
    expect(parseAndExecute("3 times 4")).toBe(12);
  });

  test("keyword division: 'divide'", () => {
    expect(parseAndExecute("10 divide 2")).toBe(5);
  });

  test("keyword division phrase 'divide by'", () => {
    expect(parseAndExecute("10 divide by 2")).toBe(5);
  });

  test("keyword exponent: 'to the power of'", () => {
    expect(parseAndExecute("2 to the power of 3")).toBe(8);
  });

  test("keyword exponent phrase 'power of'", () => {
    expect(parseAndExecute("2 power of 3")).toBe(8);
  });

  test("keyword exponent: 'exponent'", () => {
    expect(parseAndExecute("2 exponent 3")).toBe(8);
  });

  test("keyword exponent: 'prime'", () => {
    expect(parseAndExecute("2 prime 3")).toBe(8);
  });

  test("keyword modulo: 'mod'", () => {
    expect(parseAndExecute("10 mod 3")).toBe(1);
  });

  test("keyword modulo: 'modulo'", () => {
    expect(parseAndExecute("10 modulo 3")).toBe(1);
  });

  test("unicode multiply: 3 × 4 = 12", () => {
    expect(parseAndExecute("3 × 4")).toBe(12);
  });

  test("unicode divide: 6 ÷ 2 = 3", () => {
    expect(parseAndExecute("6 ÷ 2")).toBe(3);
  });

test("hex literal: 0xFF = 255", () => {
    expect(parseAndExecute("0xFF")).toBe(255);
  });

  test("hex literal: 0xff lowercase = 255", () => {
    expect(parseAndExecute("0xff")).toBe(255);
  });

  test("binary literal: 0b1010 = 10", () => {
    expect(parseAndExecute("0b1010")).toBe(10);
  });

  test("binary literal: 0B1111 = 15", () => {
    expect(parseAndExecute("0B1111")).toBe(15);
  });

  test("hex literal: 0xff lowercase = 255", () => {
    expect(parseAndExecute("0xff")).toBe(255);
  });

  test("binary literal: 0b1010 = 10", () => {
    expect(parseAndExecute("0b1010")).toBe(10);
  });

  test("binary literal: 0B1111 = 15", () => {
    expect(parseAndExecute("0B1111")).toBe(15);
  });

  test("left shift: 1 << 2 = 4", () => {
    expect(parseAndExecute("1 << 2")).toBe(4);
  });

  test("right shift: 8 >> 2 = 2", () => {
    expect(parseAndExecute("8 >> 2")).toBe(2);
  });

  test("bitwise AND: 6 & 3 = 2", () => {
    expect(parseAndExecute("6 & 3")).toBe(2);
  });

  test("bitwise OR: 4 | 2 = 6", () => {
    expect(parseAndExecute("4 | 2")).toBe(6);
  });

  test("bitwise XOR: 5 xor 3 = 6", () => {
    expect(parseAndExecute("5 xor 3")).toBe(6);
  });

  test("bitwise XOR: 7 xor 2 = 5", () => {
    expect(parseAndExecute("7 xor 2")).toBe(5);
  });

  test("BODMAS: 1 + 2 * 3 = 7", () => {
    expect(parseAndExecute("1 + 2 * 3")).toBe(7);
  });

  test("BODMAS: 2 * 3 + 4 = 10", () => {
    expect(parseAndExecute("2 * 3 + 4")).toBe(10);
  });

  test("BODMAS: 2 + 3 * 4 - 5 = 9", () => {
    expect(parseAndExecute("2 + 3 * 4 - 5")).toBe(9);
  });

  test("BODMAS: 10 - 3 - 2 = 5 (left-assoc minus)", () => {
    expect(parseAndExecute("10 - 3 - 2")).toBe(5);
  });

  test("BODMAS: 10 / 2 / 5 = 1 (left-assoc divide)", () => {
    expect(parseAndExecute("10 / 2 / 5")).toBe(1);
  });

  test("BODMAS: 2 + 3 * 4 ^ 2 = 50", () => {
    expect(parseAndExecute("2 + 3 * 4 ^ 2")).toBe(50);
  });

  test("BODMAS: (2 + 3) * 4 ^ 2 = 80", () => {
    expect(parseAndExecute("(2 + 3) * 4 ^ 2")).toBe(80);
  });

  test("BODMAS: ((2 + 3) * 4) ^ 2 = 400", () => {
    expect(parseAndExecute("((2 + 3) * 4) ^ 2")).toBe(400);
  });

  test("BODMAS: -3 ^ 2 = 9 (unary applied before exp, then result squared)", () => {
    expect(parseAndExecute("-3 ^ 2")).toBe(9);
  });

  test("BODMAS: 2 * 3 ^ 2 = 18", () => {
    expect(parseAndExecute("2 * 3 ^ 2")).toBe(18);
  });

  test("BODMAS: 2 ^ 3 * 4 = 32", () => {
    expect(parseAndExecute("2 ^ 3 * 4")).toBe(32);
  });

  test("BODMAS: 1 + 2 + 3 + 4 = 10 (chained)", () => {
    expect(parseAndExecute("1 + 2 + 3 + 4")).toBe(10);
  });

  test("BODMAS: (4 + 3) * 2 ^ 2 - 10 / 2 = 23", () => {
    expect(parseAndExecute("(4 + 3) * 2 ^ 2 - 10 / 2")).toBe(23);
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
