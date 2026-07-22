import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";

/**
 * Bug: `<variable> to <unit>` (and any non-literal expression on the left
 * of "to") threw "Undefined variable: <unit>" instead of converting.
 *
 * Root cause: the "TO" token serves two grammars — percentage change
 * (`800 to 1000`) and unit conversion (`<uom-expr> to <unit>`) — but only
 * one infix parselet is registered per token type, and PercentageChangeParselet
 * won that registration. Its only escape hatch checked `left.type === "UNIT"`,
 * which covers the literal `100cm to m` case (handled inline by
 * UomLiteralParselet before the Pratt loop ever reaches PercentageChangeParselet)
 * but not a bare variable/expression on the left, since a variable's runtime
 * type isn't knowable from its token type at parse time. `in` never had this
 * problem (InParselet has no percentage-change meaning to disambiguate from),
 * which is why `:x in m` always worked while `:x to m` didn't.
 *
 * Fix: PercentageChangeParselet now also checks whether the RIGHT-hand token
 * names a recognized unit or ISO 4217 currency code (isKnownUnit) — a
 * percentage-change target is always numeric, so a recognized unit name after
 * "to" unambiguously means conversion, regardless of what the left resolves to.
 *
 * Found via the playground's built-in "Currency Travel Budget" example
 * document, which uses this exact pattern (`:hotelTotalEUR to USD`) on 5 of
 * its 13 lines — every one of them was throwing.
 */
describe("Bug: unit/currency conversion of a variable via 'to'", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test(":x = 100cm then :x to m converts (not 'Undefined variable: m')", () => {
    engine.evaluateLine(1, ":x = 100cm");
    const [result] = engine.evaluateLine(2, ":x to m");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("m");
    expect(result.toNumber()).toBeCloseTo(1, 10);
  });

  test(":x to m matches :x in m for the same variable", () => {
    engine.evaluateLine(1, ":x = 100cm");
    const [viaTo] = engine.evaluateLine(2, ":x to m");
    const [viaIn] = engine.evaluateLine(3, ":x in m");
    expect(viaTo.toNumber()).toBeCloseTo(viaIn.toNumber(), 10);
    expect(viaTo.unit).toBe(viaIn.unit);
  });

  test("parenthesized expression to unit: (:x + :y) to m", () => {
    engine.evaluateLine(1, ":x = 50cm");
    engine.evaluateLine(2, ":y = 50cm");
    const [result] = engine.evaluateLine(3, "(:x + :y) to m");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("m");
    expect(result.toNumber()).toBeCloseTo(1, 10);
  });

  test("currency: variable to a known ISO code does not throw", () => {
    sharedCurrencyExchange.primeRates("EUR", { USD: 1.08 });
    engine.evaluateLine(1, ":total = 100 EUR");
    const [result] = engine.evaluateLine(2, ":total to USD");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("USD");
    expect(result.toNumber()).toBeCloseTo(108, 5);
  });

  test("the playground's Currency Travel Budget example evaluates every line without throwing", () => {
    sharedCurrencyExchange.primeRates("EUR", { USD: 1.08, GBP: 0.85 });
    const lines = [
      ":flightCostUSD = 1200",
      ":hotelPerNightEUR = 150",
      ":nights = 5",
      ":hotelTotalEUR = :hotelPerNightEUR * :nights",
      ":hotelTotalUSD = :hotelTotalEUR to USD",
      ":foodPerDayEUR = 60",
      ":foodTotalEUR = :foodPerDayEUR * :nights",
      ":foodTotalUSD = :foodTotalEUR to USD",
      ":totalEUR = :hotelTotalEUR + :foodTotalEUR",
      ":totalTripUSD = :flightCostUSD + :hotelTotalUSD + :foodTotalUSD",
      ":spendingMoneyEUR = 200",
      ":spendingMoneyUSD = :spendingMoneyEUR to USD",
      ":grandTotalUSD = :totalTripUSD + :spendingMoneyUSD",
    ];
    for (let i = 0; i < lines.length; i++) {
      expect(() => engine.evaluateLine(i + 1, lines[i])).not.toThrow();
    }
  });

  test("regression guard: percentage-change 'to' still works (numeric right side)", () => {
    const [result] = engine.evaluateLine(1, "800 to 1000");
    expect(result.type).toBe(ValueType.Percentage);
    expect(result.toNumber()).toBeCloseTo(0.25, 10);
  });

  test("regression guard: literal unit conversion still works (100cm to m)", () => {
    const [result] = engine.evaluateLine(1, "100cm to m");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("m");
    expect(result.toNumber()).toBeCloseTo(1, 10);
  });

  test("':x to in' — target unit name collides with the IN keyword", () => {
    // "in" (inches) is deliberately absent from knownUnits (see units.ts) —
    // it lexes as token type IN, not UNIT/IDENT, so the isKnownUnit check
    // alone can't approve it; PercentageChangeParselet must also accept
    // token type IN unconditionally, matching ConvertParselet/
    // UomLiteralParselet's existing handling of the same collision.
    engine.evaluateLine(1, ":x = 100cm");
    const [result] = engine.evaluateLine(2, ":x to in");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("in");
    expect(result.toNumber()).toBeCloseTo(39.37, 1);
  });

  test("regression guard: '3 ft in in' (both a keyword AND unit use of \"in\") still converts correctly", () => {
    // This is the case that broke when "in" was (incorrectly) added
    // directly to knownUnits: the lexer's keyword-vs-unit priority for the
    // OPERATOR "in" got confused with the TARGET "in", silently dropping
    // the conversion (regressed to 3, not 36).
    const [result] = engine.evaluateLine(1, "3 ft in in");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("in");
    expect(result.toNumber()).toBeCloseTo(36, 5);
  });
});
