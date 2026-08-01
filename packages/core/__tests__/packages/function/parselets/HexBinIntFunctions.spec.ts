/**
 * Python/JS-style `hex()` / `bin()` / `int()` call-syntax builtins.
 *
 * Distinct from the Converters package's `<expr> as hex`/`as bin`
 * (packages/converters/parselets/AsConverterParselet.ts): "as hex"
 * produces a ValueType.Hex (a typed number, still arithmetic-capable),
 * while `hex(255)` is a plain function call returning an ordinary String
 * Value — matching Python/JS convention.
 *
 * "hex"/"bin" are reused locale keywords: they previously lexed ONLY as
 * CONVERTER_NAME (for "as hex"/"as bin"); this change moves them to FUNC
 * (for call syntax) and widens AsConverterParselet's token-type check so
 * "as hex"/"as bin" keep working unchanged — see that parselet's class
 * doc for the full reasoning. The `ConvertersParselets.spec.ts` file
 * covers "as hex"/"as bin" directly; the last describe block here is a
 * focused regression guard specifically for that widening.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, CONVERTERS_PACKAGE, FUNCTION_PACKAGE, PERCENTAGE_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType, numberValue } from "@solve-js/vm/Value";
import { builtinFunctions } from "@solve-js/vm/VMBuiltins";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

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
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
  registerPackageForTesting(CONVERTERS_PACKAGE, registry);
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
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

describe("builtinFunctions[48/49/50] — direct unit coverage of hex()/bin()/int()", () => {
  const hex = builtinFunctions[48];
  const bin = builtinFunctions[49];
  const int = builtinFunctions[50];

  test("hex(255) -> \"0xFF\"", () => {
    const result = hex([numberValue(255)]);
    expect(result.type).toBe(ValueType.String);
    expect(result.value).toBe("0xFF");
  });

  test("hex(0) -> \"0x0\"", () => {
    expect(hex([numberValue(0)]).value).toBe("0x0");
  });

  test("hex(-255) -> \"-0xFF\"", () => {
    expect(hex([numberValue(-255)]).value).toBe("-0xFF");
  });

  test("hex() truncates fractional input toward zero first", () => {
    expect(hex([numberValue(255.9)]).value).toBe("0xFF");
  });

  test("bin(10) -> \"0b1010\"", () => {
    const result = bin([numberValue(10)]);
    expect(result.type).toBe(ValueType.String);
    expect(result.value).toBe("0b1010");
  });

  test("bin(0) -> \"0b0\"", () => {
    expect(bin([numberValue(0)]).value).toBe("0b0");
  });

  test("bin(-10) -> \"-0b1010\"", () => {
    expect(bin([numberValue(-10)]).value).toBe("-0b1010");
  });

  test("int(5.7) -> 5", () => {
    const result = int([numberValue(5.7)]);
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(5);
  });

  test("int(-5.7) -> -5 (truncates toward zero, not floor)", () => {
    expect(int([numberValue(-5.7)]).toNumber()).toBe(-5);
  });

  test("int(5) -> 5 (already an integer)", () => {
    expect(int([numberValue(5)]).toNumber()).toBe(5);
  });
});

describe("hex()/bin()/int() — lightweight parselet-registry harness (call syntax)", () => {
  test("hex(255)", () => {
    const result = parseAndExecute("hex(255)");
    expect(result.type).toBe(ValueType.String);
    expect(result.value).toBe("0xFF");
  });

  test("bin(10)", () => {
    const result = parseAndExecute("bin(10)");
    expect(result.type).toBe(ValueType.String);
    expect(result.value).toBe("0b1010");
  });

  test("int(5.7)", () => {
    const result = parseAndExecute("int(5.7)");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(5);
  });

  test("int(-5.7)", () => {
    expect(parseAndExecute("int(-5.7)").toNumber()).toBe(-5);
  });

  test("int() also coerces a percentage, matching trunc()'s universal toNumber() coercion", () => {
    // 50% -> 0.5 as a raw number; int(...) truncates it to 0.
    expect(parseAndExecute("int(50%)").toNumber()).toBe(0);
  });
});

describe("hex()/bin()/int() — real engine wiring (new ExpressionEngine(\"en\"))", () => {
  test("hex(255) -> \"0xFF\" via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("hex(255)");
    expect(value.type).toBe(ValueType.String);
    expect(value.value).toBe("0xFF");
  });

  test("bin(10) -> \"0b1010\" via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("bin(10)");
    expect(value.value).toBe("0b1010");
  });

  test("int(5.7) -> 5 via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("int(5.7)");
    expect(value.toNumber()).toBe(5);
  });

  test("int(-5.7) -> -5 via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("int(-5.7)");
    expect(value.toNumber()).toBe(-5);
  });
});

describe("regression guard: 'as hex' / 'as bin' still work after hex/bin became FUNC keywords", () => {
  test("255 as hex still produces a Hex value (unchanged, via CALL-syntax-capable FUNC token now)", () => {
    const result = parseAndExecute("255 as hex");
    expect(result.type).toBe(ValueType.Hex);
    expect(result.value).toBe(255);
  });

  test("10 as bin still produces \"0b1010\" (unchanged)", () => {
    const result = parseAndExecute("10 as bin");
    expect(result.value).toBe("0b1010");
  });

  test("255 as hex via the real engine, end to end", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("255 as hex");
    expect(value.type).toBe(ValueType.Hex);
    expect(value.value).toBe(255);
  });
});
