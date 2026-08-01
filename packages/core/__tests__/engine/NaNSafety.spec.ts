import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { stringValue, numberValue } from "@solve-js/vm/Value";

describe("Phase 4: NaN Safety and Edge Cases", () => {
  test("stringValue.toNumber() returns 0 for non-numeric string", () => {
    const v = stringValue("hello");
    expect(v.toNumber()).toBe(0);
  });

  test("stringValue.toNumber() still converts numeric strings", () => {
    const v = stringValue("42.5");
    expect(v.toNumber()).toBe(42.5);
  });

  test("isNaN() returns true for non-numeric string value", () => {
    const v = stringValue("hello");
    expect(v.isNaN()).toBe(true);
  });

  test("isNaN() returns false for valid number", () => {
    const v = numberValue(42);
    expect(v.isNaN()).toBe(false);
  });

  test("isNaN() returns false for hex value", () => {
    const v = numberValue(255);
    expect(v.isNaN()).toBe(false);
  });

  test("division by zero returns Infinity", () => {
    const engine = new ExpressionEngine();
    const [r] = engine.evaluateLine(1, "10 / 0");
    expect(Math.abs(r.toNumber())).toBe(Infinity);
  });

  test("sqrt of negative returns guarded result", () => {
    const engine = new ExpressionEngine();
    const [r] = engine.evaluateLine(1, "sqrt(-1)");
    expect(typeof r.toNumber()).toBe("number");
  });
});