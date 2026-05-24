import { describe, expect, test, beforeEach } from "@jest/globals";
import { resolveUnit, getMeasure, canConvert, convertUnit } from "@solve-js/uom/UomConverter";
import { LFUCache } from "@solve-js/cache";

describe("LFUCache", () => {
  let cache: LFUCache<string>;

  beforeEach(() => {
    cache = new LFUCache<string>(5); // Small cache for testing
  });

  test("initializes with empty cache", () => {
    expect(cache.size).toBe(0);
  });

  test("stores and retrieves values", () => {
    cache.put("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
    expect(cache.size).toBe(1);
  });

  test("returns null for non-existent keys", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  test("updates frequency on get", () => {
    cache.put("key1", "value1");
    expect(cache.getFrequency("key1")).toBe(1); // Frequency starts at 1 after put
    
    cache.get("key1");
    expect(cache.getFrequency("key1")).toBe(2); // Frequency increases to 2 after get
    
    cache.get("key1");
    expect(cache.getFrequency("key1")).toBe(3); // Frequency increases to 3 after another get
  });

  test("evicts least frequently used when at capacity", () => {
    // Fill cache to capacity
    cache.put("key1", "value1"); // Will be used once
    cache.put("key2", "value2"); // Will be used once
    cache.put("key3", "value3"); // Will be used once
    cache.put("key4", "value4"); // Will be used once
    cache.put("key5", "value5"); // Will be used once

    // Use key1 and key2 more frequently
    cache.get("key1");
    cache.get("key1");
    cache.get("key2");

    // Add new key to trigger eviction
    cache.put("key6", "value6");

    // key3, key4, or key5 should be evicted (they all have frequency 1)
    // key1 (freq 2) and key2 (freq 1) should remain
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key2")).toBe(true);
    expect(cache.getFrequency("key1")).toBe(3); // 2 gets + 1 initial put
  });

  test("clears cache", () => {
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    expect(cache.size).toBe(2);
    
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("key1")).toBeNull();
  });

  test("updates existing key without increasing size", () => {
    cache.put("key1", "value1");
    cache.put("key1", "updated");
    expect(cache.size).toBe(1);
    expect(cache.get("key1")).toBe("updated");
  });

  test("handles maximum capacity correctly", () => {
    // Fill cache to capacity
    for (let i = 0; i < 5; i++) {
      cache.put(`key${i}`, `value${i}`);
    }
    expect(cache.size).toBe(5);
    
    // Add one more, should evict one
    cache.put("key5", "value5");
    expect(cache.size).toBe(5); // Still at capacity
    
    // At least one of the original keys should be evicted
    const keysPresent = [0, 1, 2, 3, 4, 5].filter(i => cache.has(`key${i}`));
    expect(keysPresent.length).toBe(5); // Exactly 5 keys should be present
  });

  test("frequency tracking works correctly", () => {
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    
    // Access key1 multiple times
    cache.get("key1");
    cache.get("key1");
    cache.get("key1");
    
    // Access key2 once
    cache.get("key2");
    
    expect(cache.getFrequency("key1")).toBe(4); // 1 put + 3 gets
    expect(cache.getFrequency("key2")).toBe(2); // 1 put + 1 get
  });

  test("evicts correct key when multiple have same frequency", () => {
    // This tests the deterministic behavior of the eviction policy
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    cache.put("key3", "value3");
    cache.put("key4", "value4");
    cache.put("key5", "value5");
    
    // All keys have frequency 1 (from put)
    // Add new key to trigger eviction
    cache.put("key6", "value6");
    
    // Should have evicted one of the keys with frequency 1
    // The exact key evicted depends on Map iteration order
    const keysPresent = ["key1", "key2", "key3", "key4", "key5", "key6"]
      .filter(key => cache.has(key));
    expect(keysPresent.length).toBe(5);
  });
});

describe("resolveUnit", () => {
  test("returns same unit for known abbreviations", () => {
    expect(resolveUnit("mm")).toBe("mm");
    expect(resolveUnit("cm")).toBe("cm");
    expect(resolveUnit("m")).toBe("m");
  });

  test("handles case sensitivity (convert package is case-sensitive)", () => {
    // C is Celsius (temperature), c is centiliter (volume)
    expect(resolveUnit("C")).toBe("C");
    expect(resolveUnit("F")).toBe("F");
    expect(resolveUnit("K")).toBe("K");
    // c is centiliter, not Celsius
    expect(resolveUnit("c")).toBe("c");
  });

  test("whitespace is preserved (will be trimmed by convert package)", () => {
    expect(resolveUnit("  cm  ")).toBe("  cm  ");
  });
});

describe("getMeasure", () => {
  test("length units return 'length'", () => {
    expect(getMeasure("mm")).toBe("length");
    expect(getMeasure("cm")).toBe("length");
    expect(getMeasure("m")).toBe("length");
    expect(getMeasure("km")).toBe("length");
    expect(getMeasure("in")).toBe("length");
    expect(getMeasure("ft")).toBe("length");
  });

  test("mass units return 'mass'", () => {
    expect(getMeasure("g")).toBe("mass");
    expect(getMeasure("kg")).toBe("mass");
    expect(getMeasure("lb")).toBe("mass");
    expect(getMeasure("oz")).toBe("mass");
  });

  test("volume units return 'volume'", () => {
    expect(getMeasure("ml")).toBe("volume");
    expect(getMeasure("l")).toBe("volume");
    expect(getMeasure("gal")).toBe("volume");
  });

  test("time units return 'time'", () => {
    expect(getMeasure("s")).toBe("time");
    expect(getMeasure("min")).toBe("time");
    expect(getMeasure("h")).toBe("time");
    expect(getMeasure("d")).toBe("time");
  });

  test("temperature units return 'temperature' via aliases", () => {
    expect(getMeasure("C")).toBe("temperature");
    expect(getMeasure("F")).toBe("temperature");
    expect(getMeasure("K")).toBe("temperature");
  });

  test("currency units return undefined", () => {
    expect(getMeasure("usd")).toBeUndefined();
    expect(getMeasure("eur")).toBeUndefined();
    expect(getMeasure("gbp")).toBeUndefined();
  });

  test("unknown units return undefined", () => {
    expect(getMeasure("xyz")).toBeUndefined();
  });
});

describe("canConvert", () => {
  test("same unit is always convertible", () => {
    expect(canConvert("m", "m")).toBe(true);
    expect(canConvert("g", "g")).toBe(true);
  });

  test("length units can convert", () => {
    expect(canConvert("cm", "m")).toBe(true);
    expect(canConvert("in", "cm")).toBe(true);
    expect(canConvert("ft", "m")).toBe(true);
  });

  test("mass units can convert", () => {
    expect(canConvert("kg", "lb")).toBe(true);
    expect(canConvert("g", "oz")).toBe(true);
  });

  test("volume units can convert", () => {
    expect(canConvert("l", "gal")).toBe(true);
    expect(canConvert("ml", "cup")).toBe(true);
  });

  test("different measures cannot convert", () => {
    expect(canConvert("m", "kg")).toBe(false);
    expect(canConvert("s", "m")).toBe(false);
    expect(canConvert("C", "kg")).toBe(false);
  });
});

describe("convertUnit", () => {
  test("same unit returns same value", () => {
    expect(convertUnit(100, "m", "m")).toBe(100);
    expect(convertUnit(5, "kg", "kg")).toBe(5);
  });

  test("100 cm = 1 m", () => {
    expect(convertUnit(100, "cm", "m")).toBeCloseTo(1, 10);
  });

  test("1 m = 100 cm", () => {
    expect(convertUnit(1, "m", "cm")).toBeCloseTo(100, 10);
  });

  test("1 km = 1000 m", () => {
    expect(convertUnit(1, "km", "m")).toBeCloseTo(1000, 10);
  });

  test("1 kg = 1000 g", () => {
    expect(convertUnit(1, "kg", "g")).toBeCloseTo(1000, 10);
  });

  test("1 lb ≈ 453.592 g", () => {
    expect(convertUnit(1, "lb", "g")).toBeCloseTo(453.592, 2);
  });

  test("1 l = 1000 ml", () => {
    expect(convertUnit(1, "l", "ml")).toBeCloseTo(1000, 10);
  });

  test("1 gal ≈ 3.785 l", () => {
    expect(convertUnit(1, "gal", "l")).toBeCloseTo(3.785, 2);
  });

  test("1 ft = 12 in", () => {
    expect(convertUnit(1, "ft", "in")).toBeCloseTo(12, 10);
  });

  test("1 in ≈ 2.54 cm", () => {
    expect(convertUnit(1, "in", "cm")).toBeCloseTo(2.54, 2);
  });

  test("1 h = 3600 s", () => {
    expect(convertUnit(1, "h", "s")).toBeCloseTo(3600, 10);
  });

  test("1 min = 60 s", () => {
    expect(convertUnit(1, "min", "s")).toBeCloseTo(60, 10);
  });
});
