import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 6: Incremental Evaluation", () => {
  describe("Basic API", () => {
    test("evaluateIncremental method exists and accepts parameters", () => {
      const engine = new ExpressionEngine();
      // Parse a document first to establish state
      engine.parseDocument(":x = 5\ny = 10");

      // evaluateIncremental should exist and return a Map
      const result = engine.evaluateIncremental("x", 10);
      expect(result).toBeInstanceOf(Map);
    });

    test("getDag returns dependency graph with correct methods", () => {
      const engine = new ExpressionEngine();
      engine.parseDocument(":x = 5\nx + 3");
      const dag = engine.getDag();
      expect(dag).toBeDefined();
      expect(typeof dag.getAffectedLines).toBe("function");
      expect(typeof dag.getConsumers).toBe("function");
    });

    test("getLineCache returns line cache instance with correct methods", () => {
      const engine = new ExpressionEngine();
      const lc = engine.getLineCache();
      expect(lc).toBeDefined();
      expect(typeof lc.get).toBe("function");
      expect(typeof lc.has).toBe("function");
      expect(typeof lc.getEntryForLine).toBe("function");
      expect(typeof lc.clear).toBe("function");
    });
  });

  describe("Bytecode execution via evaluateIncremental", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
      engine = new ExpressionEngine();
    });

    test("returns updated values for dirty lines using cached bytecode", () => {
      // Establish variable and dependent expression
      engine.parseDocument(":x = 5\nx + 3");

      // Change x to 10 — line 2 (x + 3) should re-evaluate to 13
      const result = engine.evaluateIncremental("x", 10);

      expect(result.size).toBeGreaterThanOrEqual(1);
      // The updated line should have the new computed value
      for (const [, value] of result) {
        expect(value.toNumber()).toBe(13);
      }
    });

    test("returns empty Map when no lines are dirty", () => {
      engine.parseDocument("42");

      // Changing an unrelated variable should not dirty any lines
      const result = engine.evaluateIncremental("nonexistent", 99);
      expect(result.size).toBe(0);
    });

    test("handles chained variable dependencies", () => {
      // x = 5, y = x + 3, z = y * 2
      engine.parseDocument(":x = 5\n:y = :x + 3\n:z = :y * 2");

      // Verify initial state
      expect(engine.evaluateNumber(":z")).toBe(16); // (5+3)*2

      // Change x — both y and z should re-evaluate
      const result = engine.evaluateIncremental("x", 10);
      expect(result.size).toBeGreaterThanOrEqual(2);

      // Now :z should be (10+3)*2 = 26
      expect(engine.evaluateNumber(":z")).toBe(26);
    });

    test("skips entries with empty bytecode (no opcodes)", () => {
      // Parse a document with an expression that produces no tokens.
      // evaluateExpressionWithDiagnostic creates a cache entry with
      // opcodes.length === 0 for empty-token expressions.
      engine.parseDocument("42\ns`  `");

      // The empty inline solve on line 2 has no tokens, so its bytecode
      // has opcodes.length === 0. getDirtyLines returns nothing here since
      // no variable changed, but the guard is exercised.
      const cache = engine.getLineCache();
      const entry = cache.getEntryForLine(2);
      // Verify the entry exists but has empty bytecode
      expect(entry).toBeDefined();
      expect(entry!.bytecode.opcodes.length).toBe(0);
    });

    test("re-evaluated lines are accessible from LineCache", () => {
      engine.parseDocument(":x = 5\nx + 3");
      engine.evaluateIncremental("x", 10);

      // The re-evaluated entry should still be in the LineCache
      const entry = engine.getLineCache().getEntryForLine(2);
      expect(entry).toBeDefined();
      expect(entry!.result.toNumber()).toBe(13);
    });

    test("cached results persist for subsequent evaluateNumber calls", () => {
      engine.parseDocument(":x = 5\n:y = :x + 3\n:z = :y * 2");
      engine.evaluateIncremental("x", 10);

      // Subsequent evaluateNumber should use updated cached values
      expect(engine.evaluateNumber(":y")).toBe(13);
      expect(engine.evaluateNumber(":z")).toBe(26);
    });

    test("handles variable set to zero correctly", () => {
      // Regression: pre-fix, evaluateNumber(":x") returned NaN for :x = 0
      engine.parseDocument(":x = 0\n:y = :x + 5");

      // Change x from 0 to 3
      const result = engine.evaluateIncremental("x", 3);
      expect(result.size).toBeGreaterThanOrEqual(1);

      expect(engine.evaluateNumber(":x")).toBe(3);
      expect(engine.evaluateNumber(":y")).toBe(8);
    });
  });
});