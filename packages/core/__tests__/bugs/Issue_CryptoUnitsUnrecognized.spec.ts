import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

/**
 * Bug: cryptocurrency codes (BTC, ETH, SOL, XRP, ADA, DOGE, DOT) were never
 * added to the lexer's `knownUnits` gate (lexer/units.ts), even though
 * CurrencyExchangeService.isCurrency() already recognized all seven.
 *
 * `knownUnits` decides whether a code becomes a UNIT token in the first
 * place — without an entry there, `1 BTC` never reaches the currency
 * layer at all; "BTC" lexes as a bare identifier and the whole expression
 * throws "Undefined variable: BTC". The entire playground "CryptoCurrency"
 * example category (12 examples) was broken by this one gap.
 */
describe("Bug: cryptocurrency codes not recognized as units", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test.each(["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT"])(
    "%s lexes as a currency unit, not an undefined variable",
    (code) => {
      expect(() => engine.evaluateLine(1, `1 ${code}`)).not.toThrow();
      const [result] = engine.evaluateLine(1, `1 ${code}`);
      expect(result.type).toBe(ValueType.Uom);
      expect(result.unit).toBe(code);
    }
  );

  test("crypto-to-crypto conversion does not throw", () => {
    expect(() => engine.evaluateLine(1, "1 BTC to USD")).not.toThrow();
    expect(() => engine.evaluateLine(2, "10 ETH to BTC")).not.toThrow();
  });

  test("crypto arithmetic (implicit conversion) does not throw", () => {
    expect(() => engine.evaluateLine(1, "0.01 BTC + 1 ETH")).not.toThrow();
  });
});
