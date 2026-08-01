import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #79: Percentage Operator Precedence", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  // === Core precedence tests ===

  test("100 * 40% should equal 40", () => {
    const result = engine.evaluateNumber("100 * 40%");
    expect(result).toBeCloseTo(40, 5);
  });

  test("100 * 40% + 100 * 65% + 50 should equal 155", () => {
    const result = engine.evaluateNumber("100 * 40% + 100 * 65% + 50");
    expect(result).toBeCloseTo(155, 5);
  });

  test("100 * (40%) + 100 * (65%) + 50 should equal 155", () => {
    const result = engine.evaluateNumber("100 * (40%) + 100 * (65%) + 50");
    expect(result).toBeCloseTo(155, 5);
  });

  test("1 + 2% should equal 1.02", () => {
    const result = engine.evaluateNumber("1 + 2%");
    expect(result).toBeCloseTo(1.02, 5);
  });

  test("100 - 10% should equal 99.9", () => {
    const result = engine.evaluateNumber("100 - 10%");
    expect(result).toBeCloseTo(99.9, 5);
  });

  test("5 * 10% should equal 0.5", () => {
    const result = engine.evaluateNumber("5 * 10%");
    expect(result).toBeCloseTo(0.5, 5);
  });

  test("10% should equal 0.10", () => {
    const result = engine.evaluateNumber("10%");
    expect(result).toBeCloseTo(0.10, 5);
  });

  // === Percentage with "of" ===

  test("50% of 200 should equal 100", () => {
    const result = engine.evaluateNumber("50% of 200");
    expect(result).toBeCloseTo(100, 5);
  });

  test("1 + 5% of 200 should equal 11", () => {
    const result = engine.evaluateNumber("1 + 5% of 200");
    expect(result).toBeCloseTo(11, 5);
  });

  // === Edge cases ===

  test("200% should equal 2", () => {
    const result = engine.evaluateNumber("200%");
    expect(result).toBeCloseTo(2, 5);
  });

  test("50% + 50% should equal 1", () => {
    const result = engine.evaluateNumber("50% + 50%");
    expect(result).toBeCloseTo(1, 5);
  });

  // Diagnostic: inspect actual tokens for percentage expression
  test("inspect: 100 * 40% + 50 parseDocument", () => {
    const result = engine.parseDocument("100 * 40% + 50");
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].error).toBeNull();
    const val = result.lines[0].result!.toNumber();
    expect(val).toBeCloseTo(90, 5); // 100 * 0.4 + 50 = 90
  });
});