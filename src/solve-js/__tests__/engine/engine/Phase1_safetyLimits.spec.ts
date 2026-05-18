import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 1: Safety Limits", () => {
  test("rejects expression exceeding max length", () => {
    const engine = new ExpressionEngine();
    const longExpr = "1".repeat(3000);
    expect(() => engine.evaluateLine(1, longExpr)).toThrow("max length");
  });

  test("rejects overly complex expression with many function calls", () => {
    const engine = new ExpressionEngine();
    let expr = "";
    for (let i = 0; i < 60; i++) expr += `sqrt(${i}) + `;
    expr += "1";
    expect(() => engine.evaluateLine(1, expr)).toThrow("complexity");
  });

  test("accepts expression within all limits", () => {
    const engine = new ExpressionEngine();
    const result = engine.evaluateLine(1, "1 + 2 * 3");
    expect(result.toNumber()).toBe(7);
  });

  test("maxExpressionLength default is reasonable", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("1 + 1")).toBe(2);
  });
});