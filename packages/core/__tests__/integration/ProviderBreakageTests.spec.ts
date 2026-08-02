import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, type MatrixData } from "@solve-js/vm/Value";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";

describe("Provider Breakage Tests - Comprehensive Provider Validation", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en");
  });

  describe("Time/Duration Provider Issues", () => {
    test("2 weeks in days should return 14 days", () => {
      const result = engine.parseDocument(":researchDays = 2 weeks in days", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].result).toBeDefined();
      
      const value = result.lines[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(14);
    });

    test("3 days in hours should return 72 hours", () => {
      const result = engine.parseDocument("s`3 days in hours`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(72);
    });

    test("1 month in days should return approximate value", () => {
      const result = engine.parseDocument("s`1 month in days`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBeGreaterThan(28);
      expect(value.toNumber()).toBeLessThan(32);
    });

    test("1 year in days should return 365", () => {
      const result = engine.parseDocument("s`1 year in days`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(365);
    });
  });

  describe("Percentage Provider Issues", () => {
    test("10% of 200 should return 20", () => {
      const result = engine.parseDocument("s`10% of 200`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(20);
    });

    test("50% of 100 should return 50", () => {
      const result = engine.parseDocument("s`50% of 100`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(50);
    });

    test("20% increase of 100 should return 120", () => {
      const result = engine.parseDocument("s`increase 100 by 20%`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(120);
    });

    test("Percentage addition: 50% + 10% should return 0.6", () => {
      const result = engine.parseDocument("s`50% + 10%`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBeCloseTo(0.6, 5);
    });
  });

  describe("UOM Provider Issues", () => {
    test("10 mm + 5 should return 15 (UOM value)", () => {
      const result = engine.parseDocument("s`10 mm + 5`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(15);
    });

    test("10 m + 20 m should return 30", () => {
      const result = engine.parseDocument("s`10 m + 20 m`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(30);
    });

    test("convert 100 cm to m should return 1", () => {
      const result = engine.parseDocument("s`convert 100 cm to m`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBeCloseTo(1, 5);
    });

    test("1 kg + 500 g should return 1.5", () => {
      const result = engine.parseDocument("s`1 kg + 500 g`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBeCloseTo(1.5, 5);
    });
  });

  describe("Currency Provider Issues", () => {
    test("$10 + $20 should return 30", () => {
      const result = engine.parseDocument("s`$10 + $20`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(30);
    });

    test("£100 + $50 should return approximate value", () => {
      // Needs a cached GBP rate to actually convert — without one this
      // used to silently sum the raw magnitudes (100 + 50 = 150) and
      // still pass the loose 100–200 range below purely by coincidence,
      // masking the fact no real conversion had happened. Priming here
      // makes the test verify genuine converted math instead.
      sharedCurrencyExchange.primeRates("GBP", { USD: 1.25 });
      const result = engine.parseDocument("s`£100 + $50`", { inputType: 'markdown' });

      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();

      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      // £100 + $50 -> $50 converted to GBP at 1.25 USD/GBP = £40, total £140.
      expect(value.toNumber()).toBeCloseTo(140, 5);
      expect(value.unit).toBe("GBP");
    });

    test("$5 * 3 should return 15", () => {
      const result = engine.parseDocument("s`$5 * 3`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(15);
    });

    test("10% of $200 should return 20", () => {
      const result = engine.parseDocument("s`10% of $200`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(20);
    });
  });

  describe("Function Provider Issues", () => {
    test("sqrt(16) should return 4", () => {
      const result = engine.parseDocument("s`sqrt(16)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(4);
    });

    test("pow(2, 3) should return 8", () => {
      const result = engine.parseDocument("s`pow(2, 3)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(8);
    });

    test("abs(-5) should return 5", () => {
      const result = engine.parseDocument("s`abs(-5)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(5);
    });

    test("round(3.7) should return 4", () => {
      const result = engine.parseDocument("s`round(3.7)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(4);
    });
  });

  describe("Dice Provider Issues", () => {
    test("roll(1, 6) should return a number between 1 and 6", () => {
      const result = engine.parseDocument("s`roll(1, 6)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBeGreaterThanOrEqual(1);
      expect(value.toNumber()).toBeLessThanOrEqual(6);
    });

    test("roll(2, 20) should return a number between 2 and 40", () => {
      const result = engine.parseDocument("s`roll(2, 20)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBeGreaterThanOrEqual(2);
      expect(value.toNumber()).toBeLessThanOrEqual(40);
    });

    test("roll(1, 6) + roll(1, 6) should return a number between 2 and 12", () => {
      const result = engine.parseDocument("s`roll(1, 6) + roll(1, 6)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBeGreaterThanOrEqual(2);
      expect(value.toNumber()).toBeLessThanOrEqual(12);
    });
  });

  describe("Vector Provider Issues", () => {
    test("vec2(1, 2) + vec2(3, 4) should return array [4, 6]", () => {
      const result = engine.parseDocument("s`vec2(1, 2) + vec2(3, 4)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Matrix);
      expect((value.value as MatrixData).data).toEqual([4, 6]);
    });

    test("vec3(1, 2, 3) * 2 should return array [2, 4, 6]", () => {
      const result = engine.parseDocument("s`vec3(1, 2, 3) * 2`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Matrix);
      expect((value.value as MatrixData).data).toEqual([2, 4, 6]);
    });

    test("vec2(10, 20) / vec2(2, 5) should return array [5, 4]", () => {
      const result = engine.parseDocument("s`vec2(10, 20) / vec2(2, 5)`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Matrix);
      expect((value.value as MatrixData).data).toEqual([5, 4]);
    });
  });

  describe("Variable Assignment Issues", () => {
    test(":x = 10 should assign 10 to x", () => {
      const result = engine.parseDocument(":x = 10", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].result).toBeDefined();
      
      const value = result.lines[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(10);
    });

    test(":x = 10; s`:x + 5` should return 15", () => {
      const document = `:x = 10
s\`:x + 5\``;
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[1].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[1].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(15);
    });

    test(":x = 5; :y = 10; s`:x + :y` should return 15", () => {
      const document = `:x = 5
:y = 10
s\`:x + :y\``;
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(3);
      expect(result.lines[2].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[2].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(15);
    });
  });

  describe("DateTime Provider Issues", () => {
    test("now should return a datetime value", () => {
      const result = engine.parseDocument("s`now`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Datetime);
    });

    test("today should return a datetime value", () => {
      const result = engine.parseDocument("s`today`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Datetime);
    });
  });

  describe("BigInteger Provider Issues", () => {
    test("100n + 50 should return 150", () => {
      const result = engine.parseDocument("s`100n + 50`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.BigInt);
      expect(value.toNumber()).toBe(150);
    });

    test("50n + 50n should return 100", () => {
      const result = engine.parseDocument("s`50n + 50n`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.BigInt);
      expect(value.toNumber()).toBe(100);
    });
  });

  describe("Complex Mixed Expressions", () => {
    test("2 weeks in days + 3 days should return 17", () => {
      const result = engine.parseDocument("s`2 weeks in days + 3 days`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(17);
    });

    test("10% of $200 + $50 should return 70", () => {
      const result = engine.parseDocument("s`10% of $200 + $50`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Uom);
      expect(value.toNumber()).toBe(70);
    });

    test("sqrt(pow(3, 2) + pow(4, 2)) should return 5", () => {
      const result = engine.parseDocument("s`sqrt(pow(3, 2) + pow(4, 2))`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Number);
      expect(value.toNumber()).toBe(5);
    });

    test("vec2(10, 2) + 5 should return array [15, 7]", () => {
      const result = engine.parseDocument("s`vec2(10, 2) + 5`", { inputType: 'markdown' });
      
      expect(result.errors).toHaveLength(0);
      expect(result.lines[0].inlineSolves[0].result).toBeDefined();
      
      const value = result.lines[0].inlineSolves[0].result!;
      expect(value.type).toBe(ValueType.Matrix);
      expect((value.value as MatrixData).data).toEqual([15, 7]);
    });
  });
});
