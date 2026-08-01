import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

/** Local midnight epoch-ms for (year, month 1-12, day) — mirrors the
 * production code's Date construction so tests aren't timezone-brittle. */
function localMidnight(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}

describe("Date literal parsing (DateLiteralNormalizerRule + DateLiteralParselet)", () => {
  describe("European format: DD/MM/YYYY", () => {
    test("25/12/2023 is a Datetime at local midnight on 2023-12-25", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("25/12/2023");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25));
    });

    test("01/01/2000 is a Datetime", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("01/01/2000");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2000, 1, 1));
    });

    test("29/02/2024 (leap year) is a Datetime", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("29/02/2024");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2024, 2, 29));
    });

    test("2-digit year 00-68 windows to 2000s: 5/1/23 -> 2023", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("5/1/23");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 1, 5));
    });

    test("2-digit year 69-99 windows to 1900s: 5/1/99 -> 1999", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("5/1/99");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(1999, 1, 5));
    });

    test("29/02/2023 (not a leap year) is NOT a date — falls back to chained division", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("29/02/2023");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBeCloseTo(29 / 2 / 2023, 10);
    });

    test("25/13/2023 (invalid month) is NOT a date — falls back to chained division", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("25/13/2023");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBeCloseTo(25 / 13 / 2023, 10);
    });

    test("genuine division with a 1-digit trailing group is unaffected: 100/12/2", () => {
      // "100" isn't a valid day, so this must never be reinterpreted as a date.
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("100/12/2");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBeCloseTo(100 / 12 / 2, 10);
    });
  });

  describe("ISO 8601 date-only format: YYYY-MM-DD", () => {
    test("2023-12-25 is a Datetime", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("2023-12-25");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25));
    });

    test("1999-06-15 is a Datetime", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("1999-06-15");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(1999, 6, 15));
    });

    test("month/day are not swapped: 2023-01-31 is Jan 31, not Nov 3 or an error", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("2023-01-31");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 1, 31));
    });
  });

  describe("US format: MM-DD-YYYY", () => {
    test("12-25-2023 is a Datetime (Christmas)", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("12-25-2023");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25));
    });

    test("month/day are not swapped: 01-31-2023 is Jan 31", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("01-31-2023");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 1, 31));
    });

    test("2-digit year: 12-25-23 -> 2023", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("12-25-23");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25));
    });

    test("02-30-2023 (Feb 30 doesn't exist) is NOT a date — falls back to chained subtraction", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("02-30-2023");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBe(2 - 30 - 2023);
    });

    test("13-01-2023 (invalid month, first group not 4 digits) is NOT a date — falls back to chained subtraction", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("13-01-2023");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBe(13 - 1 - 2023);
    });

    test("genuine chained subtraction with non-date-shaped operands is unaffected: 100-50-25", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("100-50-25");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBe(100 - 50 - 25);
    });
  });

  describe("Dot format: DD.MM.YYYY", () => {
    test("25.12.2023 is a Datetime", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("25.12.2023");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25));
    });

    test("leading-zero day and month: 05.01.2023 is Jan 5", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("05.01.2023");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 1, 5));
    });

    test("2-digit year: 31.12.99 -> 1999", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("31.12.99");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(1999, 12, 31));
    });

    test("30.02.2023 (Feb 30 doesn't exist) is NOT a date — no operator joins the leftover literals, so it throws", () => {
      const engine = new ExpressionEngine("en", false);
      expect(() => engine.evaluateExpression("30.02.2023")).toThrow(
        'Unexpected token after expression: ".2023"'
      );
    });

    test("a genuine decimal number is unaffected when nothing follows it: 25.12 alone", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("25.12");
      expect(result.type).toBe(ValueType.Number);
      expect(result.toNumber()).toBeCloseTo(25.12, 10);
    });
  });

  describe("Integration with existing datetime arithmetic", () => {
    test("a date literal plus a duration still works: 25/12/2023 + 1 day", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("25/12/2023 + 1 day");
      expect(result.type).toBe(ValueType.Datetime);
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 26));
    });

    test("subtracting two date literals yields a duration in ms: 2023-12-25 - 2023-12-24", () => {
      const engine = new ExpressionEngine("en", false);
      const [result] = engine.evaluateExpression("2023-12-25 - 2023-12-24");
      expect(result.type).toBe(ValueType.Uom);
      expect(result.unit).toBe("ms");
      expect(result.toNumber()).toBe(localMidnight(2023, 12, 25) - localMidnight(2023, 12, 24));
    });
  });
});
