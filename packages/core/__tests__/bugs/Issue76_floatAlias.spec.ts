import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Feature #76: float() as alias for vec()", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("float(5) creates a 1D vector", () => {
    // Use colon prefix so LOAD_VAR doesn't throw on undefined 'x'.
    const result = engine.parseDocument(":x = float(5)");
    expect(result.lines[0].error).toBeNull();
  });

  test("float(3.14) evaluates correctly", () => {
    const result = engine.evaluateNumber("float(3.14)");
    expect(result).toBeCloseTo(3.14, 5);
  });

  test("float(2) + 3 works", () => {
    const result = engine.evaluateNumber("float(2) + 3");
    expect(result).toBeCloseTo(5, 5);
  });
});