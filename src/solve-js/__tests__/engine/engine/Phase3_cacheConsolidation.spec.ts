import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { LineCache } from "@solve-js/cache/LineCache";
import { numberValue } from "@solve-js/vm/Value";

describe("Phase 3: Cache Consolidation", () => {
  test("lineCache epoch starts at 0", () => {
    const cache = new LineCache();
    expect(cache.getEpoch()).toBe(0);
  });

  test("invalidateEpoch increments epoch", () => {
    const cache = new LineCache();
    cache.invalidateEpoch();
    expect(cache.getEpoch()).toBe(1);
    cache.invalidateEpoch();
    expect(cache.getEpoch()).toBe(2);
  });

  test("getOrCompute returns cached value within same epoch", () => {
    const cache = new LineCache();
    let computeCount = 0;
    const entry = cache.getOrCompute(1, "expr", () => {
      computeCount++;
      return new (require("@solve-js/cache/LineCache").LineCacheEntry)(
        numberValue(42),
        { opcodes: new Uint8Array([10, 0]), numbers: new Float64Array([42]), strings: [] },
        [], null, false
      );
    });
    expect(computeCount).toBe(1);
    expect(entry.result.toNumber()).toBe(42);

    // Same epoch, should return cached
    const entry2 = cache.getOrCompute(1, "expr", () => {
      computeCount++;
      throw new Error("should not recompute");
    });
    expect(computeCount).toBe(1); // not incremented
    expect(entry2.result.toNumber()).toBe(42);
  });

  test("getOrCompute recomputes on epoch change", () => {
    const cache = new LineCache();
    let computeCount = 0;
    cache.getOrCompute(1, "expr", () => {
      computeCount++;
      return new (require("@solve-js/cache/LineCache").LineCacheEntry)(
        numberValue(10),
        { opcodes: new Uint8Array([10, 0]), numbers: new Float64Array([10]), strings: [] },
        [], null, false
      );
    });
    expect(computeCount).toBe(1);

    cache.invalidateEpoch();
    cache.getOrCompute(1, "expr", () => {
      computeCount++;
      return new (require("@solve-js/cache/LineCache").LineCacheEntry)(
        numberValue(20),
        { opcodes: new Uint8Array([10, 0]), numbers: new Float64Array([20]), strings: [] },
        [], null, false
      );
    });
    expect(computeCount).toBe(2);
  });

  test("expressionEngine bytecode cache avoids re-parsing", () => {
    const engine = new ExpressionEngine();
    const r1 = engine.evaluateLine(1, "10 + 20");
    expect(r1.toNumber()).toBe(30);

    // Second eval should use cached bytecode
    const r2 = engine.evaluateLine(2, "10 + 20");
    expect(r2.toNumber()).toBe(30);
  });

test("clear() resets bytecode cache and line cache", () => {
     const engine = new ExpressionEngine();
     engine.evaluateLine(1, "5 + 5");
     // Line cache is keyed by line:expression
     expect(engine.getLineCache().has(1, "5 + 5")).toBe(true);

     engine.clear();
     expect(engine.getLineCache().has(1, "5 + 5")).toBe(false);
   });
});