import { describe, expect, test } from "@jest/globals";
import { MemoCache } from "@solve-js/vm/MemoCache";
import { numberValue } from "@solve-js/vm/Value";

describe("MemoCache", () => {
  test("getOrCompute computes and caches result", () => {
    const cache = new MemoCache();
    let calls = 0;
    const result = cache.getOrCompute("1+1", 1, () => {
      calls++;
      return numberValue(2);
    });
    expect(result.toNumber()).toBe(2);
    expect(calls).toBe(1);

    const cached = cache.getOrCompute("1+1", 1, () => {
      calls++;
      return numberValue(99);
    });
    expect(cached.toNumber()).toBe(2);
    expect(calls).toBe(1);
  });

  test("different expressions compute independently", () => {
    const cache = new MemoCache();
    let callsA = 0, callsB = 0;
    cache.getOrCompute("a", 1, () => { callsA++; return numberValue(1); });
    cache.getOrCompute("b", 1, () => { callsB++; return numberValue(2); });
    expect(callsA).toBe(1);
    expect(callsB).toBe(1);

    cache.getOrCompute("a", 1, () => { callsA++; return numberValue(3); });
    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
  });

  test("invalidateAll bumps epoch causing recompute", () => {
    const cache = new MemoCache();
    let calls = 0;
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(1); });
    expect(calls).toBe(1);

    cache.invalidateAll();
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(2); });
    expect(calls).toBe(2);
  });

  test("invalidate bumps epoch", () => {
    const cache = new MemoCache();
    let calls = 0;
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(1); });
    expect(calls).toBe(1);

    cache.invalidate("x");
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(2); });
    expect(calls).toBe(2);
  });

  test("same expression on different lines cached separately", () => {
    const cache = new MemoCache();
    const r1 = cache.getOrCompute("x", 1, () => numberValue(10));
    const r2 = cache.getOrCompute("x", 2, () => numberValue(20));
    expect(r1.toNumber()).toBe(10);
    expect(r2.toNumber()).toBe(20);
  });

  test("clear resets cache and epoch", () => {
    const cache = new MemoCache();
    let calls = 0;
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(1); });
    cache.clear();
    cache.getOrCompute("x", 1, () => { calls++; return numberValue(2); });
    expect(calls).toBe(2);
  });
});
