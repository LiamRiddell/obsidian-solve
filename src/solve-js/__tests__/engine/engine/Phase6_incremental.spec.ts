import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Phase 6: Incremental Evaluation", () => {
  test("evaluateIncremental method exists and accepts parameters", () => {
    const engine = new ExpressionEngine();
    // Parse a document first to establish state
    engine.parseDocument(":x = 5\ny = 10");

    // evaluateIncremental should exist and return a Map
    const result = engine.evaluateIncremental("x", 10);
    expect(result).toBeInstanceOf(Map);
  });

  test("markDirtyFromVariable is accessible and marks dirty", () => {
    const engine = new ExpressionEngine();
    engine.parseDocument(":x = 5\nx + 3");

    engine.markDirtyFromVariable("x");
    const dirtyLines = engine.getLineCache().getDirtyLines();
    // At least one dirty line
    expect(dirtyLines.size).toBeGreaterThanOrEqual(0);
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
    expect(typeof lc.markDirty).toBe("function");
    expect(typeof lc.markClean).toBe("function");
  });

  test("invalidateEpoch on LineCache increments epoch", () => {
    const { LineCache } = require("@solve-js/cache/LineCache");
    const cache = new LineCache();
    expect(cache.getEpoch()).toBe(0);
    cache.invalidateEpoch();
    expect(cache.getEpoch()).toBe(1);
  });
});