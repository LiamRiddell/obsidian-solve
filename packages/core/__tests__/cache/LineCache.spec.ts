/**
 * LineCache — Unit Tests
 *
 * Tests the per-line result cache:
 * - set/get/has/remove operations
 * - Entry metadata (readVariables, writeVariable, dependency tracking)
 * - Lifecycle: clear, removeAllForLine, overwrite-on-set
 * - Entry metadata (readVariables, writeVariable, dependency tracking)
 * - Lifecycle: clear, removeAllForLine, overwrite-on-set
 */

import { describe, expect, test } from "@jest/globals";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { numberValue, stringValue } from "@solve-js/vm/Value";

describe("LineCache", () => {
  test("get returns undefined for uncached line", () => {
    const cache = new LineCache();
    expect(cache.get(1)).toBeUndefined();
    expect(cache.has(1)).toBe(false);
  });

  test("set and get a line entry", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(42),
      { opcodes: new Uint8Array([10]), numbers: new Float64Array([42]), strings: [], hasAsync: false },
      [],
      null
    );
    cache.set(1, entry);
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(entry);
    expect(cache.get(1)!.result.toNumber()).toBe(42);
  });

  test("entry survives clear and reload", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    );
    cache.set(1, entry);
    // Dirty state is managed by DocumentModel, not LineCache
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)!.result.toNumber()).toBe(0);
  });

  test("getEntryForLine finds entries by line prefix", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(42),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    );
    cache.set(5, entry, "x + 1");
    const found = cache.getEntryForLine(5);
    expect(found).toBeDefined();
    expect(found!.result.toNumber()).toBe(42);
  });

  test("getEntryForLine returns undefined for unknown line", () => {
    const cache = new LineCache();
    expect(cache.getEntryForLine(99)).toBeUndefined();
  });

  test("remove cleans up entry", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    );
    cache.set(1, entry);
    cache.remove(1);
    expect(cache.has(1)).toBe(false);
  });

  test("clear resets all state", () => {
    const cache = new LineCache();
    cache.set(1, new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ));
    cache.clear();
    expect(cache.has(1)).toBe(false);
    expect(cache.size).toBe(0);
  });

  test("removeAllForLine cleans up the entry for a line number", () => {
    const cache = new LineCache();
    cache.set(10, new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ), "expr1");
    expect(cache.size).toBe(1);
    cache.removeAllForLine(10);
    expect(cache.size).toBe(0);
  });

  // Regression guard for a real, session-long memory leak (and a latent
  // getEntryForLine() staleness bug): every edit to a line used to add a
  // NEW entry keyed by that edit's expression text, with nothing ever
  // evicting the previous one — set() must instead enforce "at most one
  // entry per line number," since get()/getEntryForLine() are only ever
  // meaningfully queried with a line's CURRENT text.
  test("set() for a NEW expression on an already-cached line evicts the old entry instead of accumulating", () => {
    const cache = new LineCache();
    cache.set(10, new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ), "1 + 1");
    expect(cache.size).toBe(1);

    // Simulates the user editing line 10's text -- a different expression,
    // same line number.
    cache.set(10, new LineCacheEntry(
      numberValue(2),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ), "1 + 2");

    // The old expression's entry is gone -- not still sitting in the map --
    // and the cache has NOT grown: still exactly one entry for this line.
    expect(cache.size).toBe(1);
    expect(cache.get(10, "1 + 1")).toBeUndefined();
    expect(cache.get(10, "1 + 2")!.result.toNumber()).toBe(2);
    expect(cache.getEntryForLine(10)!.result.toNumber()).toBe(2);
  });

  test("many successive edits to the same line never grow the cache past one entry (leak regression)", () => {
    const cache = new LineCache();
    for (let i = 0; i < 500; i++) {
      cache.set(1, new LineCacheEntry(
        numberValue(i),
        { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
        [],
        null
      ), `expression-state-${i}`);
    }
    expect(cache.size).toBe(1);
    expect(cache.getEntryForLine(1)!.result.toNumber()).toBe(499);
  });

  test("clearLine is alias for removeAllForLine", () => {
    const cache = new LineCache();
    cache.set(5, new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ));
    cache.clearLine(5);
    expect(cache.has(5)).toBe(false);
  });

  test("stores dependency metadata", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      stringValue("hello"),
      { opcodes: new Uint8Array([10, 20]), numbers: new Float64Array(0), strings: ["hello"], hasAsync: false },
      ["x", "y"],
      "z"
    );
    cache.set(10, entry);
    const retrieved = cache.get(10)!;
    expect(retrieved.readVariables).toEqual(["x", "y"]);
    expect(retrieved.writeVariable).toBe("z");
    expect(retrieved.result.value).toBe("hello");
  });

  test("size tracks entry count", () => {
    const cache = new LineCache();
    expect(cache.size).toBe(0);
    cache.set(1, new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ));
    expect(cache.size).toBe(1);
    cache.set(2, new LineCacheEntry(
      numberValue(2),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    ));
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test("set overwrites existing entry for same key", () => {
    const cache = new LineCache();
    const entry1 = new LineCacheEntry(
      numberValue(1),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    );
    const entry2 = new LineCacheEntry(
      numberValue(2),
      { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false },
      [],
      null
    );
    cache.set(1, entry1);
    cache.set(1, entry2);
    expect(cache.get(1)!.result.toNumber()).toBe(2);
  });
});
