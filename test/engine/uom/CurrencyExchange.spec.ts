import { describe, expect, test } from "@jest/globals";
import { CurrencyExchange } from "@/engine/uom/CurrencyExchange";

describe("CurrencyExchange fallback rates", () => {
  test("getRate between same currency is 1", () => {
    const fx = new CurrencyExchange();
    expect(fx.getRate("USD", "USD")).toBe(1);
    expect(fx.getRate("GBP", "GBP")).toBe(1);
    expect(fx.getRate("EUR", "EUR")).toBe(1);
  });

  test("getRate('USD', 'EUR') uses fallback rate", () => {
    const fx = new CurrencyExchange();
    const rate = fx.getRate("USD", "EUR");
    expect(rate).toBeCloseTo(0.92, 2);
  });

  test("getRate('EUR', 'USD') inverts fallback rate", () => {
    const fx = new CurrencyExchange();
    const rate = fx.getRate("EUR", "USD");
    expect(rate).toBeCloseTo(1 / 0.92, 2);
  });

  test("getRate('GBP', 'JPY') uses cross rate", () => {
    const fx = new CurrencyExchange();
    const rate = fx.getRate("GBP", "JPY");
    expect(rate).toBeCloseTo(151.5 / 0.79, 1);
  });

  test("getRate with unknown currency returns 1", () => {
    const fx = new CurrencyExchange();
    expect(fx.getRate("USD", "XYZ")).toBe(1);
    expect(fx.getRate("XYZ", "USD")).toBe(1);
  });

  test("convert same currency returns input", () => {
    const fx = new CurrencyExchange();
    expect(fx.convert(100, "USD", "USD")).toBe(100);
    expect(fx.convert(50, "EUR", "EUR")).toBe(50);
  });

  test("convert 100 USD to EUR", () => {
    const fx = new CurrencyExchange();
    const result = fx.convert(100, "USD", "EUR");
    expect(result).toBeCloseTo(92, 0);
  });

  test("convert 50 GBP to USD", () => {
    const fx = new CurrencyExchange();
    const result = fx.convert(50, "GBP", "USD");
    expect(result).toBeCloseTo(50 / 0.79, 1);
  });

  test("convert 1000 JPY to USD", () => {
    const fx = new CurrencyExchange();
    const result = fx.convert(1000, "JPY", "USD");
    expect(result).toBeCloseTo(1000 / 151.5, 1);
  });

  test("convert 100 EUR to GBP", () => {
    const fx = new CurrencyExchange();
    const result = fx.convert(100, "EUR", "GBP");
    expect(result).toBeCloseTo(100 * (0.79 / 0.92), 1);
  });

  test("isCurrency returns true for known currencies", () => {
    const fx = new CurrencyExchange();
    expect(fx.isCurrency("usd")).toBe(true);
    expect(fx.isCurrency("eur")).toBe(true);
    expect(fx.isCurrency("gbp")).toBe(true);
    expect(fx.isCurrency("jpy")).toBe(true);
    expect(fx.isCurrency("aud")).toBe(true);
  });

  test("isCurrency returns false for physical units", () => {
    const fx = new CurrencyExchange();
    expect(fx.isCurrency("mm")).toBe(false);
    expect(fx.isCurrency("kg")).toBe(false);
    expect(fx.isCurrency("m")).toBe(false);
  });

  test("isCurrency returns false for unknown codes", () => {
    const fx = new CurrencyExchange();
    expect(fx.isCurrency("xyz")).toBe(false);
  });

  test("rates are case-insensitive", () => {
    const fx = new CurrencyExchange();
    expect(fx.getRate("usd", "eur")).toBeCloseTo(0.92, 2);
    expect(fx.getRate("USD", "eur")).toBeCloseTo(0.92, 2);
    expect(fx.isCurrency("GBP")).toBe(true);
  });
});