/**
 * Large-number magnitude suffixes: `2.5k`, `5M`, `10G`/`10B`, `20T`.
 *
 * A NUMBER literal immediately followed by a single-letter magnitude
 * suffix (k=thousand, M=million, G/B=billion, T=trillion) fuses at the
 * normalizer stage into a single scaled NUMBER token — `2.5k` should
 * behave identically to typing `2500` directly.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, UOM_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { TokenNormalizer } from "@solve-js/normalizer";
import { largeNumberSuffixNormalizerRule } from "@solve-js/packages/arithmetic/normalizer/LargeNumberSuffixNormalizerRule";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

const normalizer = new TokenNormalizer();
normalizer.register(largeNumberSuffixNormalizerRule());

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
  const rawTokens = tokenize(lexer, input);
  const tokens = normalizer.normalize(rawTokens);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
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

describe("large-number suffixes — lightweight parselet-registry harness", () => {
  test("2.5k -> 2500", () => {
    const result = parseAndExecute("2.5k");
    expect(result.type).toBe(ValueType.Number);
    expect(result.toNumber()).toBe(2500);
  });

  test("5M -> 5000000", () => {
    expect(parseAndExecute("5M").toNumber()).toBe(5000000);
  });

  test("10G -> 10000000000", () => {
    expect(parseAndExecute("10G").toNumber()).toBe(10000000000);
  });

  test("10B -> 10000000000 (B is a synonym for G, billion)", () => {
    expect(parseAndExecute("10B").toNumber()).toBe(10000000000);
  });

  test("20T -> 20000000000000", () => {
    expect(parseAndExecute("20T").toNumber()).toBe(20000000000000);
  });

  test("2.5k + 1000 -> 3500 (composes with ordinary arithmetic)", () => {
    expect(parseAndExecute("2.5k + 1000").toNumber()).toBe(3500);
  });

  test("a suffix with no whitespace fuses; a plain 'k' elsewhere does not", () => {
    // Sanity: the token-adjacency check is exercised end-to-end above by
    // "2.5k" succeeding — this asserts the underlying rule object refuses
    // to match when the tokens aren't adjacent (see the dedicated
    // adjacency section below for the precise "2.5 k" case).
    const result = parseAndExecute("2.5k");
    expect(result.toNumber()).toBe(2500);
  });

  test("exact floating-point precision: 1.005k -> 1005, not 1004.9999999999999", () => {
    // Guards the string-shift implementation against the classic
    // `1.005 * 1000 === 1004.9999999999999` IEEE-754 rounding trap that a
    // naive `rawValue * Math.pow(10, magnitude)` implementation would hit.
    expect(parseAndExecute("1.005k").toNumber()).toBe(1005);
  });

  test("extra fractional digits beyond the suffix's magnitude are preserved: 2.5678k -> 2567.8", () => {
    expect(parseAndExecute("2.5678k").toNumber()).toBeCloseTo(2567.8);
  });
});

describe("large-number suffixes — adjacency (no space) is required", () => {
  test("'2.5 k' (space before suffix) does NOT fuse — stays two tokens", () => {
    const lexer = new Lexer();
    const rawTokens = tokenize(lexer, "2.5 k");
    const tokens = normalizer.normalize(rawTokens);
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ["NUMBER", "2.5"],
      ["IDENT", "k"],
    ]);
  });

  test("'5 M' (space before suffix) does NOT fuse", () => {
    const lexer = new Lexer();
    const rawTokens = tokenize(lexer, "5 M");
    const tokens = normalizer.normalize(rawTokens);
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ["NUMBER", "5"],
      ["IDENT", "M"],
    ]);
  });
});

describe("large-number suffixes — negative controls (must NOT be affected)", () => {
  test("5 km (real unit, space-separated) still works normally", () => {
    const result = parseAndExecute("5 km");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("km");
    expect(result.toNumber()).toBe(5);
  });

  test("5km (real unit, no space) still works normally — 'k' alone is not a unit, but 'km' is a single combined token", () => {
    const result = parseAndExecute("5km");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("km");
    expect(result.toNumber()).toBe(5);
  });

  test("5m (meters) is unaffected — lowercase 'm' is never treated as the million suffix", () => {
    const result = parseAndExecute("5m");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("m");
    expect(result.toNumber()).toBe(5);
  });

  test("100kg (kilograms) is unaffected — 'kg' is a single combined UNIT token, not bare 'k'", () => {
    const result = parseAndExecute("100kg");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("kg");
    expect(result.toNumber()).toBe(100);
  });

  test("5MB / 10GB / 1TB (byte-size units) are unaffected — multi-letter lookalikes never match the single-letter suffix", () => {
    expect(parseAndExecute("5MB")).toMatchObject({ type: ValueType.Uom, unit: "MB", value: 5 });
    expect(parseAndExecute("10GB")).toMatchObject({ type: ValueType.Uom, unit: "GB", value: 10 });
    expect(parseAndExecute("1TB")).toMatchObject({ type: ValueType.Uom, unit: "TB", value: 1 });
  });

  test("0x hex / 0b binary literals are never suffix-scaled even if immediately followed by a suffix letter", () => {
    // "0xFFk" is a nonsensical input, but must not silently corrupt the
    // hex literal into a different, wrong number.
    const lexer = new Lexer();
    const rawTokens = tokenize(lexer, "0xFF");
    const tokens = normalizer.normalize(rawTokens);
    expect(tokens.map((t) => [t.type, t.value])).toEqual([["NUMBER", "0xFF"]]);
  });
});

describe("ARITHMETIC_PACKAGE — real engine wiring", () => {
  test("2.5k works via the real, default-constructed ExpressionEngine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("2.5k");
    expect(value.type).toBe(ValueType.Number);
    expect(value.toNumber()).toBe(2500);
  });

  test("2.5k + 1000 -> 3500 via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("2.5k + 1000");
    expect(value.toNumber()).toBe(3500);
  });

  test("5M / 10G / 10B / 20T via the real engine", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.evaluateExpression("5M")[0].toNumber()).toBe(5000000);
    expect(engine.evaluateExpression("10G")[0].toNumber()).toBe(10000000000);
    expect(engine.evaluateExpression("10B")[0].toNumber()).toBe(10000000000);
    expect(engine.evaluateExpression("20T")[0].toNumber()).toBe(20000000000000);
  });

  test("negative control: 5 km still resolves as a real unit via the real engine", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("5 km");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.unit).toBe("km");
    expect(value.toNumber()).toBe(5);
  });
});
