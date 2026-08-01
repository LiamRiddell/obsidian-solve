import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, FUNCTION_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes, tokenTypeId } from "@solve-js/lexer/Token";
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

function parseAndExecute(input: string): number {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
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

  // "arc"-prefixed long-form aliases (Numi/older-calculator naming
  // convention) -- same builtin index as the short form, not a separate
  // implementation.
  test("arcsin(0) aliases asin", () => {
    expect(parseAndExecute("arcsin(0)")).toBeCloseTo(0);
  });

  test("arccos(1) aliases acos", () => {
    expect(parseAndExecute("arccos(1)")).toBeCloseTo(0);
  });

  test("arctan(0) aliases atan", () => {
    expect(parseAndExecute("arctan(0)")).toBeCloseTo(0);
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

  test("root(2, 16) -- square root via the general n-th-root form", () => {
    expect(parseAndExecute("root(2, 16)")).toBeCloseTo(4);
  });

  test("root(3, 27) -- cube root, matches cbrt(27)", () => {
    expect(parseAndExecute("root(3, 27)")).toBeCloseTo(3);
  });

  test("fact(5) -- factorial", () => {
    expect(parseAndExecute("fact(5)")).toBe(120);
  });

  test("fact(0) -- factorial of zero is 1", () => {
    expect(parseAndExecute("fact(0)")).toBe(1);
  });

  test("factorial(5) -- full-word alias for fact", () => {
    expect(parseAndExecute("factorial(5)")).toBe(120);
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

  // "min" is a known unit (minute) but contextual LPAREN lookahead in
  // ExpressionLexer.tokenizeIdentifier() now peeks past whitespace for '('.
  // When followed by '(', "min" skips the UNIT check and falls through to
  // keyword lookup, which maps it to FUNC — enabling the function parselet.
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

  test("unknown function parses as a user-function call and fails at VM execution", () => {
    // PrecedenceParser's IDENT_ID case routes `IDENT LPAREN ... RPAREN` (with
    // no trailing `=`) to CALL_USER_FUNCTION unconditionally (mirrors
    // LOAD_VAR's own forward-reference behavior — resolved by name at VM
    // execution time, not at parse time).
    const registry = new ParseletRegistry();
    const parser = new Parser(registry);
    const builder = new BytecodeBuilder();
    const tokens = [
      { type: "IDENT", typeId: tokenTypeId("IDENT"), value: "unknownFunc", text: "unknownFunc", offset: 0, lineBreaks: 0, line: 1, col: 1 },
      { type: "LPAREN", typeId: tokenTypeId("LPAREN"), value: "(", text: "(", offset: 11, lineBreaks: 0, line: 1, col: 12 },
      { type: "NUMBER", typeId: tokenTypeId("NUMBER"), value: "42", text: "42", offset: 12, lineBreaks: 0, line: 1, col: 13 },
      { type: "RPAREN", typeId: tokenTypeId("RPAREN"), value: ")", text: ")", offset: 14, lineBreaks: 0, line: 1, col: 15 },
    ];
    parser.load(tokens);
    // Should NOT throw at parse time — resolution is deferred to the VM.
    expect(() => {
      parser.parseExpression(0, builder);
    }).not.toThrow();
    const program = builder.build();
    const vm = createVM(sharedOpRegistry);
    // Undefined functions throw UNDEFINED_FUNCTION at VM execution time.
    expect(() => {
      unwrapEvalResult(executeBytecode(
        { opcodes: new Uint8Array(program.opcodes), numbers: new Float64Array(program.numbers), strings: program.strings },
        vm
      ));
    }).toThrow(/Undefined function: unknownFunc/);
  });
});
