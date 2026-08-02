/**
 * FormatEngine — Unit Tests
 *
 * Tests the value-to-string formatting engine:
 * - All ValueType variants (Number, Hex, BigInt, String, Uom, Array, Boolean, Datetime, Percentage)
 * - Locale framework (en default, fallback, keyword maps)
 */

import { describe, expect, it } from "@jest/globals";
import { formatValue } from "@solve-js/format/FormatEngine";
import { Value, ValueType, numberValue, hexValue, bigIntValue, stringValue, uomValue, rowVectorValue } from "@solve-js/vm/Value";
import { getLocale } from "@solve-js/constants/locales";

describe("FormatEngine", () => {
  it("formats number values", () => {
    const result = formatValue(numberValue(42));
    expect(result).toContain("42");
  });

  it("formats hex values", () => {
    const result = formatValue(hexValue(255));
    expect(result).toContain("0xFF");
  });

  it("formats bigint values", () => {
    const result = formatValue(bigIntValue(BigInt(123)));
    expect(result).toContain("123");
  });

  it("formats string values", () => {
    const result = formatValue(stringValue("hello"));
    expect(result).toContain("hello");
  });

  it("formats uom values", () => {
    const result = formatValue(uomValue(100, "cm"));
    expect(result).toContain("100");
    expect(result).toContain("cm");
  });

  it("formats vector2 values", () => {
    const result = formatValue(rowVectorValue([1, 2]));
    expect(result).toContain("1");
    expect(result).toContain("2");
  });

  it("formats vector3 values", () => {
    const result = formatValue(rowVectorValue([1, 2, 3]));
    expect(result).toContain("1");
    expect(result).toContain("3");
  });

  it("formats boolean values", () => {
    const result = formatValue(new Value(ValueType.Boolean, true));
    expect(result).toContain("true");
  });

  it("formats datetime values", () => {
    const d = new Date("2024-01-15T12:00:00").getTime();
    const result = formatValue(new Value(ValueType.Datetime, d));
    expect(result).not.toBe("");
  });

  it("formats percentage values (stored as a fraction, e.g. 0.25 for 25%)", () => {
    // ValueType.Percentage's sole producer (VM.ts TO_PERCENTAGE opcode)
    // always stores a fraction — matches Value.ts's documented contract.
    // A prior version of this test constructed Value(Percentage, 25)
    // directly, which doesn't match how the VM ever actually produces one,
    // and masked a real bug: formatPercentage wasn't multiplying by 100,
    // so "800 to 1000" (a 25% change) displayed as "0.25%" instead of "25%".
    const result = formatValue(new Value(ValueType.Percentage, 0.25));
    expect(result).toContain("25");
    expect(result).not.toContain("0.25");
  });

  it("formats duration values (as UoM)", () => {
    const result = formatValue(uomValue(5, "days"));
    expect(result).toContain("5");
    expect(result).toContain("days");
  });

  it("formats unit values", () => {
    const result = formatValue(new Value(ValueType.Unit, 1, "m"));
    expect(result).toContain("1");
  });
});

describe("Currency display formatting (formatUom via CURRENCY_DISPLAY)", () => {
  it("formats USD as a prefix symbol with no space: $100.00", () => {
    const result = formatValue(uomValue(100, "USD"));
    expect(result).toBe("= $100.00");
  });

  it("formats GBP as a prefix symbol: £250.00", () => {
    const result = formatValue(uomValue(250, "GBP"));
    expect(result).toBe("= £250.00");
  });

  it("formats EUR as a prefix symbol: €50.00", () => {
    const result = formatValue(uomValue(50, "EUR"));
    expect(result).toBe("= €50.00");
  });

  it("formats RUB as a spaced suffix symbol: 100.00 ₽", () => {
    const result = formatValue(uomValue(100, "RUB"));
    expect(result).toBe("= 100.00 ₽");
  });

  it("formats UAH as a spaced suffix symbol: 100.00 ₴", () => {
    const result = formatValue(uomValue(100, "UAH"));
    expect(result).toBe("= 100.00 ₴");
  });

  it("formats VND as an unspaced suffix symbol: 100.00₫", () => {
    const result = formatValue(uomValue(100, "VND"));
    expect(result).toBe("= 100.00₫");
  });

  it("formats SEK as a spaced suffix 'kr': 100.00 kr", () => {
    const result = formatValue(uomValue(100, "SEK"));
    expect(result).toBe("= 100.00 kr");
  });

  it("formats BRL with the multi-character prefix symbol 'R$': R$100.00", () => {
    const result = formatValue(uomValue(100, "BRL"));
    expect(result).toBe("= R$100.00");
  });

  it("is case-insensitive on the unit code (lowercase 'usd' still matches CURRENCY_DISPLAY)", () => {
    const result = formatValue(uomValue(100, "usd"));
    expect(result).toBe("= $100.00");
  });

  it("falls back to the generic 'amount CODE' format for a currency not in CURRENCY_DISPLAY (e.g. AED)", () => {
    const result = formatValue(uomValue(100, "AED"));
    expect(result).toBe("= 100.00 AED");
  });

  it("non-currency units are unaffected by the currency-display path (e.g. cm)", () => {
    const result = formatValue(uomValue(100, "cm"));
    expect(result).toBe("= 100.00 cm");
  });
});

describe("Locale framework", () => {
  it("loads en locale by default", () => {
    const locale = getLocale("en");
    expect(locale.code).toBe("en");
    expect(locale.keywordMap.pi).toBe("PI");
  });

  it("falls back to en for unknown locale", () => {
    const locale = getLocale("zz");
    expect(locale.code).toBe("en");
  });

  it("contains all expected keywords in english locale", () => {
    const locale = getLocale("en");
    expect(locale.keywordMap.plus).toBe("PLUS");
    expect(locale.keywordMap.and).toBe("PLUS");
    expect(locale.keywordMap.of).toBe("OF");
    expect(locale.keywordMap.roll).toBe("ROLL");
    expect(locale.keywordMap.sin).toBe("FUNC");
    expect(locale.keywordMap.convert).toBe("CONVERT");
    expect(locale.display.resultPrefix).toBe("= ");
    expect(locale.display.percentageSuffix).toBe("%");
  });
});
