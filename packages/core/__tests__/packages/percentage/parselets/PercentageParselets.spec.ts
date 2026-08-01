import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, PERCENTAGE_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";


import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { ValueType } from "@solve-js/vm/Value";
import { TokenNormalizer, BUILTIN_PHRASES } from "@solve-js/normalizer";

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
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
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
  expect(result.type === ValueType.Number || result.type === ValueType.Percentage).toBe(true);
  return result.toNumber();
}

function parseAndExecuteFull(input: string) {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
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
  expect(result).toBeDefined();
  return unwrapEvalResult(result);
}

let _normalizer: TokenNormalizer | null = null;
function getNormalizer(): TokenNormalizer {
  if (!_normalizer) {
    _normalizer = new TokenNormalizer();
    for (const [phrase, tokenType] of Object.entries(BUILTIN_PHRASES)) {
      _normalizer.addPhrase(phrase, tokenType);
    }
  }
  return _normalizer;
}

/** Like parseAndExecute but routes tokens through the TokenNormalizer first.
 *  This allows phrase-fused tokens (INCREASE_BY, DECREASE_BY) to reach the
 *  parser — without it the raw lexer emits INCREASE + BY as separate tokens
 *  and the prefix IncreaseDecreaseParselet handles them instead. */
function parseAndExecuteNormalized(input: string): number {
  const lexer = new Lexer();
  const rawTokens = tokenize(lexer, input);
  const normalized = getNormalizer().normalize(rawTokens);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(normalized);
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
  expect(result.type === ValueType.Number || result.type === ValueType.Percentage).toBe(true);
  return result.toNumber();
}

describe("Percentage Parselets", () => {
  test("standalone percentage: 50% = 0.5", () => {
    expect(parseAndExecute("50%")).toBe(0.5);
  });

  test("standalone percentage: 10% = 0.1", () => {
    expect(parseAndExecute("10%")).toBe(0.1);
  });

  test("integer percentage: 100% = 1", () => {
    expect(parseAndExecute("100%")).toBe(1);
  });

  test("percentage addition: 50% + 10%", () => {
    expect(parseAndExecute("50% + 10%")).toBe(0.6);
  });

  test("percentage in expression: 50 + 20%", () => {
    expect(parseAndExecute("50 + 20%")).toBe(50.2);
  });

  test("percentage of: 10% of 20", () => {
    expect(parseAndExecute("10% of 20")).toBe(2);
  });

  test("percentage of: 50% of 200", () => {
    expect(parseAndExecute("50% of 200")).toBe(100);
  });

  test("percentage multiplication: 50% * 100", () => {
    expect(parseAndExecute("50% * 100")).toBe(50);
  });

  test("percentage division: 50% / 25%", () => {
    expect(parseAndExecute("50% / 25%")).toBe(2);
  });

  test("percentage increase: increase 100 by 10% = 110", () => {
    expect(parseAndExecute("increase 100 by 10%")).toBeCloseTo(110);
  });

  test("percentage decrease: decrease 100 by 10% = 90", () => {
    expect(parseAndExecute("decrease 100 by 10%")).toBeCloseTo(90);
  });

  test("percentage increase by 50%: increase 200 by 50% = 300", () => {
    expect(parseAndExecute("increase 200 by 50%")).toBeCloseTo(300);
  });

  test("percentage decrease by 25%: decrease 80 by 25% = 60", () => {
    expect(parseAndExecute("decrease 80 by 25%")).toBeCloseTo(60);
  });

  test("increase by phrase keyword: increase 100 by 10%", () => {
    expect(parseAndExecute("increase 100 by 10%")).toBeCloseTo(110);
  });

  test("decrease by phrase keyword: decrease 100 by 10%", () => {
    expect(parseAndExecute("decrease 100 by 10%")).toBeCloseTo(90);
  });

  test("percentage of with expression: 50% of (40 + 60) = 50", () => {
    expect(parseAndExecute("50% of (40 + 60)")).toBe(50);
  });

  test("percentage combined with arithmetic: 10% of 200 + 5 = 25", () => {
    expect(parseAndExecute("10% of 200 + 5")).toBe(25);
  });

  test("BODMAS with percentage: 50% of 200 + 10% of 100 = 110", () => {
    expect(parseAndExecute("50% of 200 + 10% of 100")).toBe(110);
  });

  test("percentage change: 800 to 1000 = 0.25 (25% increase)", () => {
    const result = parseAndExecuteFull("800 to 1000");
    expect(result.type).toBe(ValueType.Percentage);
    expect(result.toNumber()).toBeCloseTo(0.25, 10);
  });

  test("percentage change: 800 to 400 = -0.5 (-50% decrease)", () => {
    const result = parseAndExecuteFull("800 to 400");
    expect(result.type).toBe(ValueType.Percentage);
    expect(result.toNumber()).toBeCloseTo(-0.5, 10);
  });

  test("percentage change: 50 to 75 = 0.5 (50% increase)", () => {
    const result = parseAndExecuteFull("50 to 75");
    expect(result.type).toBe(ValueType.Percentage);
    expect(result.toNumber()).toBeCloseTo(0.5, 10);
  });

  test("percentage change: 200 to 100 = -0.5 (-50% decrease)", () => {
    const result = parseAndExecuteFull("200 to 100");
    expect(result.type).toBe(ValueType.Percentage);
    expect(result.toNumber()).toBeCloseTo(-0.5, 10);
  });

  // ── INCREASE_BY / DECREASE_BY infix parselet tests ──────────────────
  // These route tokens through the TokenNormalizer which fuses adjacent
  // "increase by" → INCREASE_BY and "decrease by" → DECREASE_BY tokens.
  // Without the normalizer the raw lexer emits INCREASE + BY as separate
  // tokens and the prefix IncreaseDecreaseParselet handles them instead.

  test("INCREASE_BY parselet: 100 increase by 10% = 110", () => {
    expect(parseAndExecuteNormalized("100 increase by 10%")).toBeCloseTo(110);
  });

  test("DECREASE_BY parselet: 100 decrease by 10% = 90", () => {
    expect(parseAndExecuteNormalized("100 decrease by 10%")).toBeCloseTo(90);
  });

  test("INCREASE_BY parselet: 100 increase by 20% = 120", () => {
    expect(parseAndExecuteNormalized("100 increase by 20%")).toBeCloseTo(120);
  });

  test("DECREASE_BY parselet: 100 decrease by 20% = 80", () => {
    expect(parseAndExecuteNormalized("100 decrease by 20%")).toBeCloseTo(80);
  });

  test("INCREASE_BY parselet: 50 increase by 50% = 75", () => {
    expect(parseAndExecuteNormalized("50 increase by 50%")).toBeCloseTo(75);
  });

  test("DECREASE_BY parselet: 80 decrease by 25% = 60", () => {
    expect(parseAndExecuteNormalized("80 decrease by 25%")).toBeCloseTo(60);
  });

  test("INCREASE_BY parselet edge: 200 increase by 0% = 200", () => {
    expect(parseAndExecuteNormalized("200 increase by 0%")).toBeCloseTo(200);
  });

  test("DECREASE_BY parselet edge: 100 decrease by 100% = 0", () => {
    expect(parseAndExecuteNormalized("100 decrease by 100%")).toBeCloseTo(0);
  });

  test("INCREASE_BY parselet edge: 0 increase by 50% = 0", () => {
    expect(parseAndExecuteNormalized("0 increase by 50%")).toBeCloseTo(0);
  });

  test("DECREASE_BY parselet edge: 1 decrease by 50% = 0.5", () => {
    expect(parseAndExecuteNormalized("1 decrease by 50%")).toBeCloseTo(0.5);
  });
});
