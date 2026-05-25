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
      { opcodes: [10], numbers: [42], strings: [] },
      [],
      null
    );
    cache.set(1, entry);
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(entry);
    expect(cache.get(1)!.result.toNumber()).toBe(42);
  });

  test("markDirty and markClean are retained as no-ops (backward compat)", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    );
    cache.set(1, entry);
    cache.markDirty(1);
    // markDirty is a no-op — dirty state tracked in DocumentModel
    cache.markClean(1);
    // markClean is a no-op — dirty state tracked in DocumentModel
    expect(cache.has(1)).toBe(true);
  });

  test("getEntryForLine finds entries by line prefix", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(42),
      { opcodes: [], numbers: [], strings: [] },
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
      { opcodes: [], numbers: [], strings: [] },
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
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    ));
    cache.clear();
    expect(cache.has(1)).toBe(false);
    expect(cache.size).toBe(0);
  });

  test("removeAllForLine cleans all entries for a line number", () => {
    const cache = new LineCache();
    cache.set(10, new LineCacheEntry(
      numberValue(1),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    ), "expr1");
    cache.set(10, new LineCacheEntry(
      numberValue(2),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    ), "expr2");
    expect(cache.size).toBe(2);
    cache.removeAllForLine(10);
    expect(cache.size).toBe(0);
  });

  test("clearLine is alias for removeAllForLine", () => {
    const cache = new LineCache();
    cache.set(5, new LineCacheEntry(
      numberValue(1),
      { opcodes: [], numbers: [], strings: [] },
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
      { opcodes: [10, 20], numbers: [], strings: ["hello"] },
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
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    ));
    expect(cache.size).toBe(1);
    cache.set(2, new LineCacheEntry(
      numberValue(2),
      { opcodes: [], numbers: [], strings: [] },
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
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    );
    const entry2 = new LineCacheEntry(
      numberValue(2),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null
    );
    cache.set(1, entry1);
    cache.set(1, entry2);
    expect(cache.get(1)!.result.toNumber()).toBe(2);
  });
});
