import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Feature #80: Scientific Notation", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("1e6 evaluates to 1000000", () => {
    const result = engine.evaluateNumber("1e6");
    expect(result).toBe(1000000);
  });

  test("2.5e-3 evaluates to 0.0025", () => {
    const result = engine.evaluateNumber("2.5e-3");
    expect(result).toBeCloseTo(0.0025, 10);
  });

  test("3e2 + 100 = 400", () => {
    const result = engine.evaluateNumber("3e2 + 100");
    expect(result).toBe(400);
  });

  test("1.5e4 works", () => {
    const result = engine.evaluateNumber("1.5e4");
    expect(result).toBe(15000);
  });

  test("1E3 works (uppercase E)", () => {
    const result = engine.evaluateNumber("1E3");
    expect(result).toBe(1000);
  });
});