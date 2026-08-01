/**
 * CurrencyAliases — Unit Tests
 *
 * Pure tests for the symbol/word -> ISO 4217 alias table and the reverse
 * display-formatting table, independent of the lexer/parser/VM pipeline.
 * Engine-level (lex/parse/evaluate) coverage for the same features lives in
 * __tests__/packages/uom/parselets/UomParselets.spec.ts and the
 * currency-display formatting coverage lives in __tests__/format/FormatEngine.spec.ts.
 */
import { describe, expect, test } from "@jest/globals";
import {
  CURRENCY_SYMBOL_ALIASES,
  CURRENCY_WORD_ALIASES,
  CURRENCY_DISPLAY,
  resolveCurrencyAlias,
} from "@solve-js/uom/CurrencyAliases";
import { knownUnits } from "@solve-js/lexer/units";

describe("resolveCurrencyAlias — symbols", () => {
  test.each([
    ["$", "USD"],
    ["£", "GBP"],
    ["€", "EUR"],
    ["¥", "JPY"],
    ["₽", "RUB"],
    ["₩", "KRW"],
    ["₹", "INR"],
    ["₺", "TRY"],
    ["₴", "UAH"],
    ["₪", "ILS"],
    ["₫", "VND"],
    ["₦", "NGN"],
    ["₱", "PHP"],
  ])("%s -> %s", (symbol, iso) => {
    expect(resolveCurrencyAlias(symbol)).toBe(iso);
  });
});

describe("resolveCurrencyAlias — word forms (singular/plural)", () => {
  test.each([
    ["dollar", "USD"], ["dollars", "USD"],
    ["euro", "EUR"], ["euros", "EUR"],
    ["yen", "JPY"],
    ["ruble", "RUB"], ["rubles", "RUB"], ["rouble", "RUB"], ["roubles", "RUB"],
    ["won", "KRW"],
    ["rupee", "INR"], ["rupees", "INR"],
    ["yuan", "CNY"], ["renminbi", "CNY"],
    ["rand", "ZAR"],
    ["real", "BRL"], ["reais", "BRL"],
    ["shekel", "ILS"], ["shekels", "ILS"],
    ["lira", "TRY"],
    ["hryvnia", "UAH"], ["hryvnias", "UAH"],
    ["zloty", "PLN"], ["zlotys", "PLN"],
    ["forint", "HUF"],
    ["koruna", "CZK"],
    ["dirham", "AED"], ["dirhams", "AED"],
    ["ringgit", "MYR"],
    ["rupiah", "IDR"],
    ["baht", "THB"],
    ["dong", "VND"],
    ["naira", "NGN"],
  ])("%s -> %s", (word, iso) => {
    expect(resolveCurrencyAlias(word)).toBe(iso);
  });

  test("resolveCurrencyAlias itself lowercases word input defensively (e.g. 'Euro' still resolves)", () => {
    // The real case-sensitivity gate is upstream, in the lexer's knownUnits
    // set (see UomParselets.spec.ts's "word aliases are case-sensitive"
    // test) -- capitalized forms never lex as a UNIT token in the first
    // place, so this function never actually sees them in practice. This
    // just documents resolveCurrencyAlias's own defensive behavior.
    expect(resolveCurrencyAlias("Euro")).toBe("EUR");
    expect(resolveCurrencyAlias("EURO")).toBe("EUR");
  });
});

describe("resolveCurrencyAlias — documented ambiguous defaults", () => {
  test.each([
    ["peso", "MXN"], ["pesos", "MXN"],
    ["franc", "CHF"], ["francs", "CHF"],
    ["krona", "SEK"], ["kronor", "SEK"],
    ["krone", "NOK"], ["kroner", "NOK"],
    ["riyal", "SAR"], ["riyals", "SAR"],
    ["rial", "SAR"], ["rials", "SAR"],
  ])("%s defaults to %s", (word, iso) => {
    expect(resolveCurrencyAlias(word)).toBe(iso);
  });

  test("₱ (PESO SIGN) resolves to PHP, deliberately differing from the word 'peso' -> MXN", () => {
    expect(resolveCurrencyAlias("₱")).toBe("PHP");
    expect(resolveCurrencyAlias("peso")).toBe("MXN");
  });
});

describe("resolveCurrencyAlias — deliberate exclusions", () => {
  test("'pound'/'pounds' are NOT currency aliases — already claimed as a Mass unit", () => {
    expect(resolveCurrencyAlias("pound")).toBeUndefined();
    expect(resolveCurrencyAlias("pounds")).toBeUndefined();
    expect(knownUnits.has("pound")).toBe(true);
    expect(knownUnits.has("pounds")).toBe(true);
  });

  test("'dinar' is NOT a currency alias — too many incompatible real-world values", () => {
    expect(resolveCurrencyAlias("dinar")).toBeUndefined();
    expect(resolveCurrencyAlias("dinars")).toBeUndefined();
  });

  test("an already-canonical ISO code is not touched by resolution (returns undefined, callers fall back to original)", () => {
    expect(resolveCurrencyAlias("USD")).toBeUndefined();
    expect(resolveCurrencyAlias("GBP")).toBeUndefined();
  });

  test("unrecognized text resolves to undefined", () => {
    expect(resolveCurrencyAlias("banana")).toBeUndefined();
  });
});

describe("knownUnits — every currency word alias is registered as a lexable UNIT", () => {
  test("every CURRENCY_WORD_ALIASES key is present in knownUnits", () => {
    for (const word of Object.keys(CURRENCY_WORD_ALIASES)) {
      expect(knownUnits.has(word)).toBe(true);
    }
  });
});

describe("CURRENCY_DISPLAY — shape and representative entries", () => {
  test("every entry has a non-empty symbol and a valid position", () => {
    for (const [code, info] of Object.entries(CURRENCY_DISPLAY)) {
      expect(info.symbol.length).toBeGreaterThan(0);
      expect(["prefix", "suffix"]).toContain(info.position);
      expect(typeof info.spaced).toBe("boolean");
      expect(code).toBe(code.toUpperCase());
    }
  });

  test("USD is prefix, unspaced ($100.00)", () => {
    expect(CURRENCY_DISPLAY.USD).toEqual({ symbol: "$", position: "prefix", spaced: false });
  });

  test("RUB is suffix, spaced (100.00 ₽)", () => {
    expect(CURRENCY_DISPLAY.RUB).toEqual({ symbol: "₽", position: "suffix", spaced: true });
  });

  test("SEK/NOK/DKK share the Scandinavian suffix-spaced 'kr' convention", () => {
    expect(CURRENCY_DISPLAY.SEK).toEqual({ symbol: "kr", position: "suffix", spaced: true });
    expect(CURRENCY_DISPLAY.NOK).toEqual({ symbol: "kr", position: "suffix", spaced: true });
    expect(CURRENCY_DISPLAY.DKK).toEqual({ symbol: "kr", position: "suffix", spaced: true });
  });

  test("VND is suffix, unspaced (100.00₫)", () => {
    expect(CURRENCY_DISPLAY.VND).toEqual({ symbol: "₫", position: "suffix", spaced: false });
  });

  test("a currency with no widely-recognized symbol convention (e.g. AED) is absent from the table", () => {
    expect(CURRENCY_DISPLAY.AED).toBeUndefined();
  });
});
