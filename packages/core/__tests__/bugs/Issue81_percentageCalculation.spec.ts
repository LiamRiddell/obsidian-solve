import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #81: Percentage calculation error", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("15% should resolve to 0.15", () => {
    const [result] = engine.evaluateLine(1, "15%");
    expect(result.toNumber()).toBeCloseTo(0.15, 10);
  });

  test("50% should resolve to 0.5", () => {
    const [result] = engine.evaluateLine(1, "50%");
    expect(result.toNumber()).toBeCloseTo(0.5, 10);
  });

  test("1+15%+25% should equal 1.4 (percentages resolve before addition)", () => {
    const [result] = engine.evaluateLine(1, "1+15%+25%");
    // 1 + 0.15 + 0.25 = 1.4
    expect(result.toNumber()).toBeCloseTo(1.4, 10);
  });

  test("percentage as multiplication operand: 200*10%", () => {
    const [result] = engine.evaluateLine(1, "200*10%");
    // 200 * 0.10 = 20
    expect(result.toNumber()).toBeCloseTo(20, 10);
  });

  test("percentage with addition: 100+10%", () => {
    const [result] = engine.evaluateLine(1, "100+10%");
    // 100 + 0.10 = 100.1
    expect(result.toNumber()).toBeCloseTo(100.1, 10);
  });

  test("chained percentage: 50%+25%", () => {
    const [result] = engine.evaluateLine(1, "50%+25%");
    // 0.50 + 0.25 = 0.75
    expect(result.toNumber()).toBeCloseTo(0.75, 10);
  });

  test("percentage precedence with multiplication: 10+20%*2", () => {
    // % has bp=60 (Prefix), * has bp=40 (Product)
    // So % binds tighter: 10 + (20%) * 2 = 10 + 0.20 * 2 = 10.40
    const [result] = engine.evaluateLine(1, "10+20%*2");
    expect(result.toNumber()).toBeCloseTo(10.4, 10);
  });
});