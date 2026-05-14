import { describe, expect, it } from "@jest/globals";
import { formatValue } from "@/engine/format/FormatEngine";
import { Value, ValueType, numberValue, hexValue, bigIntValue, stringValue, uomValue, vectorValue } from "@/engine/vm/Value";
import { getLocale } from "@/engine/constants/locales";

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
    const result = formatValue(vectorValue([1, 2]));
    expect(result).toContain("1");
    expect(result).toContain("2");
  });

  it("formats vector3 values", () => {
    const result = formatValue(vectorValue([1, 2, 3]));
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

  it("formats percentage values", () => {
    const result = formatValue(new Value(ValueType.Percentage, 25));
    expect(result).toContain("25");
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