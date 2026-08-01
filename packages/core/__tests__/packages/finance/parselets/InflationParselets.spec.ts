/**
 * Inflation-adjusted value (extends packages/finance/) — CPI-based
 * adjustment between two arbitrary years (function-call form and the
 * "what is ... in YEAR1 worth in YEAR2" phrase), the two present-year-
 * relative phrase forms ("what is $X from YEAR" / "what was $X worth in
 * YEAR" / "$X in YEAR dollars"), and the flat-rate future-value
 * projection ("value of $X in YEAR assuming N% inflation").
 *
 * Expected numeric results are computed dynamically from the SAME bundled
 * CPI_TABLE the implementation uses (via `inflationRatio`), rather than
 * hardcoded numbers — the present-year-relative forms depend on
 * `new Date().getFullYear()` at evaluation time, so a hardcoded expected
 * value would go stale on every new year. See FinanceParselets.spec.ts for
 * the established `evalReal()` pattern this file follows.
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, FUNCTION_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { inflationRatio, CPI_MIN_YEAR, CPI_MAX_YEAR } from "@solve-js/packages/finance/data/CpiTable";

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

function evalReal(expr: string): Value {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

const CURRENT_YEAR = new Date().getFullYear();

describe("inflationAdjust (function-call form)", () => {
  test("inflationAdjust(500, 1970, 2020) matches the bundled CPI table's ratio", () => {
    const ratio = inflationRatio(1970, 2020)!;
    expect(parseAndExecute("inflationAdjust(500, 1970, 2020)").toNumber()).toBeCloseTo(500 * ratio, 2);
  });

  test("inflationAdjust with fromYear === toYear is a no-op (ratio 1)", () => {
    expect(parseAndExecute("inflationAdjust(500, 2000, 2000)").toNumber()).toBeCloseTo(500, 6);
  });

  test("inflationAdjust errors on a year outside the bundled CPI table's range", () => {
    expect(parseAndExecute("inflationAdjust(500, 1900, 2020)").type).toBe(ValueType.Error);
  });

  test(`the bundled CPI table covers ${CPI_MIN_YEAR}-${CPI_MAX_YEAR}, including the present year`, () => {
    expect(CPI_MIN_YEAR).toBeLessThanOrEqual(1970);
    expect(CPI_MAX_YEAR).toBeGreaterThanOrEqual(CURRENT_YEAR);
  });
});

describe(`what is $X from YEAR -> present-day value (real engine, present year = ${CURRENT_YEAR})`, () => {
  test("what is $500 from 1970 -> 500 adjusted to the present year", () => {
    const ratio = inflationRatio(1970, CURRENT_YEAR)!;
    const value = evalReal("what is $500 from 1970");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(500 * ratio, 1);
  });

  test("what is 500 from 2003 -> works without a currency sigil too (plain number)", () => {
    const ratio = inflationRatio(2003, CURRENT_YEAR)!;
    expect(evalReal("what is 500 from 2003").toNumber()).toBeCloseTo(500 * ratio, 1);
  });
});

describe("what was $X worth in YEAR -> historical value (real engine)", () => {
  test("what was $500 worth in 1997 -> present-day 500 expressed in 1997 dollars", () => {
    const ratio = inflationRatio(CURRENT_YEAR, 1997)!;
    const value = evalReal("what was $500 worth in 1997");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(500 * ratio, 1);
  });
});

describe("what is $X in YEAR1 worth in YEAR2 -> adjust between two arbitrary years (real engine)", () => {
  test("what is $500 in 1990 worth in 2010", () => {
    const ratio = inflationRatio(1990, 2010)!;
    const value = evalReal("what is $500 in 1990 worth in 2010");
    expect(value.toNumber()).toBeCloseTo(500 * ratio, 2);
  });

  test("an arithmetic amount still works when parenthesized: what is ($300 + $200) in 1990 worth in 2010", () => {
    const ratio = inflationRatio(1990, 2010)!;
    expect(evalReal("what is ($300 + $200) in 1990 worth in 2010").toNumber()).toBeCloseTo(500 * ratio, 2);
  });
});

describe("$X in YEAR dollars -> express an amount in a specific historical year's dollars (real engine)", () => {
  test("$500 in 1990 dollars -> same math as 'what was $500 worth in 1990'", () => {
    const ratio = inflationRatio(CURRENT_YEAR, 1990)!;
    const value = evalReal("$500 in 1990 dollars");
    expect(value.toNumber()).toBeCloseTo(500 * ratio, 1);
  });

  test("regression guard: ordinary currency conversion ($X in <CURRENCY>) still works — the IN_YEAR_DOLLARS fusion only fires before a NUMBER + 'dollars', never before a currency UNIT token", () => {
    const value = evalReal("$500 in GBP");
    // Currency conversion resolves asynchronously (CurrencyAsyncResolver) —
    // a single evaluateExpression call may return Pending immediately
    // rather than a resolved Uom; either outcome proves the IN_YEAR_DOLLARS
    // fusion didn't hijack this expression (a hijack would surface as an
    // inflation-related Error or a parse failure instead).
    expect([ValueType.Uom, ValueType.Pending]).toContain(value.type);
  });
});

describe("value of $X in FUTURE_YEAR assuming N% inflation -> flat-rate projection (real engine)", () => {
  test(`value of $500 in ${CURRENT_YEAR + 5} assuming 3% inflation -> 500 * 1.03^5`, () => {
    const value = evalReal(`value of $500 in ${CURRENT_YEAR + 5} assuming 3% inflation`);
    expect(value.toNumber()).toBeCloseTo(500 * Math.pow(1.03, 5), 3);
  });

  test(`value of 1000 in ${CURRENT_YEAR + 1} assuming 5% inflation -> 1000 * 1.05`, () => {
    const value = evalReal(`value of 1000 in ${CURRENT_YEAR + 1} assuming 5% inflation`);
    expect(value.toNumber()).toBeCloseTo(1000 * 1.05, 3);
  });
});

describe("FINANCE_PACKAGE inflation — regression guards (bare variable names must still work)", () => {
  test("':what', ':was', ':value', ':worth' all still work as variable names — only the full two-word phrases (\"what is\", \"what was\", \"value of\", \"worth in\") are claimed as keywords, never the bare leading word", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":what = 1");
    engine.evaluateExpression(":was = 2");
    engine.evaluateExpression(":value = 3");
    engine.evaluateExpression(":worth = 4");
    const [value] = engine.evaluateExpression(":what + :was + :value + :worth");
    expect(value.toNumber()).toBe(10);
  });

  test("regression guard: ordinary arithmetic elsewhere is unaffected by the new phrase/normalizer rules", () => {
    expect(evalReal("(1 + 2) * 3").toNumber()).toBe(9);
  });
});
