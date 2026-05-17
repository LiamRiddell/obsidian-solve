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
      null,
      false
    );
    cache.set(1, entry);
    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(entry);
    expect(cache.get(1)!.result.toNumber()).toBe(42);
  });

  test("markDirty sets dirty flag and tracks line", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null,
      false
    );
    cache.set(1, entry);
    cache.markDirty(1);
    expect(entry.dirty).toBe(true);
    expect(cache.isDirty(1)).toBe(true);
    expect(cache.getDirtyLines().has(1)).toBe(true);
  });

  test("markClean clears dirty flag", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null,
      false
    );
    cache.set(1, entry);
    cache.markDirty(1);
    cache.markClean(1);
    expect(entry.dirty).toBe(false);
    expect(cache.isDirty(1)).toBe(false);
    expect(cache.getDirtyLines().has(1)).toBe(false);
  });

  test("markDirty works even if entry is not in cache yet (creates dirty line only)", () => {
    const cache = new LineCache();
    cache.markDirty(5);
    expect(cache.isDirty(5)).toBe(false);
    expect(cache.getDirtyLines().has(5)).toBe(true);
    const entry = new LineCacheEntry(
      numberValue(1),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null,
      false
    );
    cache.set(5, entry);
    cache.markDirty(5);
    expect(entry.dirty).toBe(true);
  });

  test("remove cleans up entry and dirty state", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      numberValue(0),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null,
      false
    );
    cache.set(1, entry);
    cache.markDirty(1);
    cache.remove(1);
    expect(cache.has(1)).toBe(false);
    expect(cache.isDirty(1)).toBe(false);
    expect(cache.getDirtyLines().has(1)).toBe(false);
  });

  test("clear resets all state", () => {
    const cache = new LineCache();
    cache.set(1, new LineCacheEntry(
      numberValue(1),
      { opcodes: [], numbers: [], strings: [] },
      [],
      null,
      false
    ));
    cache.markDirty(1);
    cache.clear();
    expect(cache.has(1)).toBe(false);
    expect(cache.getDirtyLines().size).toBe(0);
  });

  test("stores dependency metadata", () => {
    const cache = new LineCache();
    const entry = new LineCacheEntry(
      stringValue("hello"),
      { opcodes: [10, 20], numbers: [], strings: ["hello"] },
      ["x", "y"],
      "z",
      true
    );
    cache.set(10, entry);
    const retrieved = cache.get(10)!;
    expect(retrieved.readVariables).toEqual(["x", "y"]);
    expect(retrieved.writeVariable).toBe("z");
    expect(retrieved.dirty).toBe(true);
    expect(retrieved.result.value).toBe("hello");
  });
});
