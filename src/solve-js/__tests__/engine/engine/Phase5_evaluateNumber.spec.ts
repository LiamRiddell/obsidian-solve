import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 5: evaluateNumber fast path", () => {
  test("evaluateNumber returns numeric result for valid expression", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("42 + 8")).toBe(50);
  });

  test("evaluateNumber returns NaN for invalid expression", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("hello")).toBeNaN();
  });

  test("evaluateNumber handles division", () => {
    const engine = new ExpressionEngine();
    expect(engine.evaluateNumber("100 / 4")).toBe(25);
  });

  test("evaluateNumber skips Value allocation", () => {
    const engine = new ExpressionEngine();
    const result = engine.evaluateNumber("2 + 3");
    expect(typeof result).toBe("number");
    expect(result).toBe(5);
  });
});