import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 5: evaluateNumber fast path", () => {
  describe("Basic arithmetic", () => {
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

  describe("Bare identifier handling (regression: distinguish zero from undefined)", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
      engine = new ExpressionEngine();
    });

    test("bare undefined identifier returns NaN", () => {
      expect(engine.evaluateNumber("myvar")).toBeNaN();
      expect(engine.evaluateNumber("x")).toBeNaN();
      expect(engine.evaluateNumber("undefinedVar")).toBeNaN();
    });

    test("bare identifier set to a value returns that value", () => {
      engine.parseDocument(":myvar = 42");
      expect(engine.evaluateNumber("myvar")).toBe(42);
    });

    test("bare identifier set to zero returns zero (not NaN)", () => {
      // Regression: pre-fix, evaluateNumber returned NaN for :x = 0
      // because the post-hoc check 'result.toNumber() === 0' was ambiguous
      engine.parseDocument(":x = 0");
      expect(engine.evaluateNumber("x")).toBe(0);

      engine.parseDocument(":zero = 0");
      expect(engine.evaluateNumber("zero")).toBe(0);
    });

    test("bare identifier set to negative number returns that number", () => {
      engine.parseDocument(":neg = -5");
      expect(engine.evaluateNumber("neg")).toBe(-5);
    });

    test("bare identifier set to a large number returns that number", () => {
      engine.parseDocument(":big = 999999");
      expect(engine.evaluateNumber("big")).toBe(999999);
    });

    test("identifier used in expression resolves correctly", () => {
      engine.parseDocument(":x = 10");
      expect(engine.evaluateNumber("x + 5")).toBe(15);
      expect(engine.evaluateNumber("x * 2")).toBe(20);
    });

    test("identifier used in expression throws for undefined variable (no longer defaults to 0)", () => {
      // VM's LOAD_VAR now throws for undefined variables instead of silently
      // returning numberValue(0). So "x + 5" with undefined x throws.
      // Use evaluateNumber("x") directly for testing undefined → NaN.
      expect(engine.evaluateNumber("x + 5")).toBeNaN();
    });

    test("multi-character bare identifier preceded by colon resolves as variable", () => {
      engine.parseDocument(":myVar = 77");
      expect(engine.evaluateNumber(":myVar")).toBe(77);
    });

    test("identifier with underscore and digits is recognized", () => {
      engine.parseDocument(":var_1 = 100");
      expect(engine.evaluateNumber("var_1")).toBe(100);
    });

    test("changing variable value with evaluateIncremental then evaluateNumber returns updated value", () => {
      engine.parseDocument(":x = 5\n:y = :x + 3");
      engine.evaluateIncremental("x", 20);
      expect(engine.evaluateNumber("x")).toBe(20);
      expect(engine.evaluateNumber("y")).toBe(23);
    });
  });
});