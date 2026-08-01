/**
 * UomConverter — Unit Tests
 *
 * Tests the unit-of-measurement conversion system:
 * - LFUCache (eviction, frequency tracking, capacity limits)
 * - resolveUnit (abbreviation handling, case sensitivity)
 * - getMeasure (category classification: length, mass, volume, time, temperature)
 * - canConvert (same-measure compatibility check)
 * - convertUnit (actual unit conversion with known conversion factors)
 */

import { describe, expect, test, beforeEach } from "@jest/globals";
import { resolveUnit, getMeasure, canConvert, convertUnit, isConvertibleUnit, getBestUnit } from "@solve-js/uom/UomConverter";
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

/**
 * Extended (custom) measure categories — Speed, Pace, Voltage, Current,
 * Apparent Power, Reactive Power, Reactive Energy, Volume Flow Rate,
 * Parts-Per. None of these are supported by the `convert` package itself
 * (confirmed: `Object.keys(MeasureKind)` only has the 16 kinds covered
 * above), so they're hand-implemented in ExtendedUnits.ts and wired into
 * getMeasure/canConvert/convertUnit as a fallback layer.
 */
describe("extended measures: speed", () => {
  test("getMeasure returns 'speed'", () => {
    expect(getMeasure("mps")).toBe("speed");
    expect(getMeasure("kph")).toBe("speed");
    expect(getMeasure("mph")).toBe("speed");
    expect(getMeasure("kn")).toBe("speed");
    expect(getMeasure("ft_s")).toBe("speed");
  });

  // "fps" (feet/s) is deliberately NOT a registered unit — it collides with
  // the Time package's "fps" (frames/s), confirmed by a real regression in
  // VideoTimecode.spec.ts. "ft_s" is used instead.
  test("'fps' alone is not a UoM unit (reserved for the Time package's frames/s)", () => {
    expect(getMeasure("fps")).toBeUndefined();
  });

  test("canConvert is true within speed, false against other measures", () => {
    expect(canConvert("mph", "kph")).toBe(true);
    expect(canConvert("kn", "mps")).toBe(true);
    expect(canConvert("mph", "kg")).toBe(false);
    expect(canConvert("mph", "min_km")).toBe(false); // speed ≠ pace
  });

  test("1 mps = 3.6 kph", () => {
    expect(convertUnit(1, "mps", "kph")).toBeCloseTo(3.6, 10);
  });

  test("60 mph ≈ 96.56064 kph", () => {
    expect(convertUnit(60, "mph", "kph")).toBeCloseTo(96.56064, 5);
  });

  test("1 kn ≈ 1.852 kph", () => {
    expect(convertUnit(1, "kn", "kph")).toBeCloseTo(1.852, 10);
  });

  test("isConvertibleUnit is true for speed units", () => {
    expect(isConvertibleUnit("mph")).toBe(true);
    expect(isConvertibleUnit("kn")).toBe(true);
  });
});

describe("extended measures: pace", () => {
  test("getMeasure returns 'pace'", () => {
    expect(getMeasure("min_km")).toBe("pace");
    expect(getMeasure("min_mi")).toBe("pace");
  });

  test("canConvert is true within pace, false against speed", () => {
    expect(canConvert("min_km", "min_mi")).toBe(true);
    expect(canConvert("min_km", "mps")).toBe(false);
  });

  test("1 min_mi ≈ 0.621371 min_km (pace scales opposite to distance)", () => {
    // A mile is longer than a km, so the same per-mile pace is a *smaller*
    // per-km number — mi→km factor (1.609344) inverted.
    expect(convertUnit(1, "min_mi", "min_km")).toBeCloseTo(1 / 1.609344, 5);
  });

  test("4 min_km ≈ 6.4374 min_mi", () => {
    expect(convertUnit(4, "min_km", "min_mi")).toBeCloseTo(4 * 1.609344, 5);
  });
});

describe("extended measures: voltage and current", () => {
  test("getMeasure classifies voltage and current separately", () => {
    expect(getMeasure("mV")).toBe("voltage");
    expect(getMeasure("kV")).toBe("voltage");
    expect(getMeasure("A")).toBe("current");
    expect(getMeasure("mA")).toBe("current");
    expect(getMeasure("kA")).toBe("current");
  });

  // Bare "V" is deliberately NOT a registered unit — it collides with the
  // stocks package's "V" (Visa) ticker, which also requires an IDENT token
  // (StockTickerNormalizerRule). "mV"/"kV" are used instead.
  test("'V' alone is not a UoM unit (reserved for the stocks package's Visa ticker)", () => {
    expect(getMeasure("V")).toBeUndefined();
  });

  test("voltage and current are not mutually convertible", () => {
    expect(canConvert("kV", "A")).toBe(false);
  });

  test("1 kV = 1,000,000 mV", () => {
    expect(convertUnit(1, "kV", "mV")).toBeCloseTo(1_000_000, 6);
  });

  test("1 kA = 1000 A = 1,000,000 mA", () => {
    expect(convertUnit(1, "kA", "A")).toBeCloseTo(1000, 10);
    expect(convertUnit(1, "kA", "mA")).toBeCloseTo(1_000_000, 6);
  });
});

describe("extended measures: apparent power, reactive power, reactive energy", () => {
  test("getMeasure classifies each power/energy variant separately, distinct from real power/energy", () => {
    expect(getMeasure("VA")).toBe("apparentPower");
    expect(getMeasure("kvar")).toBe("reactivePower");
    expect(getMeasure("varh")).toBe("reactiveEnergy");
    // Real power/energy (covered by the `convert` package) stay distinct categories.
    expect(getMeasure("W")).toBe("power");
    expect(getMeasure("Wh")).toBe("energy");
  });

  // The bare IEC symbol "var" is deliberately NOT a registered unit — it
  // collides with "var" as a variable name (confirmed by a real regression
  // in ExpressionLexer.identifiers-keywords.spec.ts's "$var" test). Only
  // "kvar"/"Mvar" are supported; see ExtendedUnits.ts.
  test("'var' alone is not a UoM unit (reserved for variable names)", () => {
    expect(getMeasure("var")).toBeUndefined();
  });

  test("apparent power, reactive power, and real power are not mutually convertible", () => {
    expect(canConvert("VA", "kvar")).toBe(false);
    expect(canConvert("VA", "W")).toBe(false);
    expect(canConvert("kvar", "W")).toBe(false);
  });

  test("1 MVA = 1000 kVA = 1,000,000 VA", () => {
    expect(convertUnit(1, "MVA", "kVA")).toBeCloseTo(1000, 10);
    expect(convertUnit(1, "MVA", "VA")).toBeCloseTo(1_000_000, 6);
  });

  test("1 Mvar = 1000 kvar", () => {
    expect(convertUnit(1, "Mvar", "kvar")).toBeCloseTo(1000, 10);
  });

  test("1 kvarh = 1000 varh", () => {
    expect(convertUnit(1, "kvarh", "varh")).toBeCloseTo(1000, 10);
  });
});

describe("extended measures: volume flow rate", () => {
  test("getMeasure returns 'volumeFlowRate'", () => {
    expect(getMeasure("m3s")).toBe("volumeFlowRate");
    expect(getMeasure("m3h")).toBe("volumeFlowRate");
    expect(getMeasure("lps")).toBe("volumeFlowRate");
    expect(getMeasure("lpm")).toBe("volumeFlowRate");
    expect(getMeasure("gpm")).toBe("volumeFlowRate");
    expect(getMeasure("cfs")).toBe("volumeFlowRate");
  });

  test("1 m3s = 3600 m3h", () => {
    expect(convertUnit(1, "m3s", "m3h")).toBeCloseTo(3600, 10);
  });

  test("1 m3s = 1000 lps", () => {
    expect(convertUnit(1, "m3s", "lps")).toBeCloseTo(1000, 10);
  });

  test("1 lps = 60 lpm", () => {
    expect(convertUnit(1, "lps", "lpm")).toBeCloseTo(60, 10);
  });

  test("1 gpm ≈ 0.0630901964 lps", () => {
    expect(convertUnit(1, "gpm", "lps")).toBeCloseTo(0.0630901964, 8);
  });

  test("1 cfs ≈ 28.3168466 lps", () => {
    expect(convertUnit(1, "cfs", "lps")).toBeCloseTo(28.3168466, 5);
  });

  test("volume flow rate is not convertible with plain volume", () => {
    expect(canConvert("m3s", "l")).toBe(false);
  });
});

describe("extended measures: parts-per", () => {
  test("getMeasure returns 'partsPer'", () => {
    expect(getMeasure("ppm")).toBe("partsPer");
    expect(getMeasure("ppb")).toBe("partsPer");
    expect(getMeasure("ppt")).toBe("partsPer");
    expect(getMeasure("permille")).toBe("partsPer");
  });

  test("1 ppm = 1000 ppb = 1,000,000 ppt", () => {
    expect(convertUnit(1, "ppm", "ppb")).toBeCloseTo(1000, 10);
    expect(convertUnit(1, "ppm", "ppt")).toBeCloseTo(1_000_000, 6);
  });

  test("1 permille = 1000 ppm", () => {
    expect(convertUnit(1, "permille", "ppm")).toBeCloseTo(1000, 10);
  });

  test("'%' is not part of the Parts-Per UoM category (owned by the Percentage provider)", () => {
    expect(getMeasure("%")).toBeUndefined();
  });
});

describe("extended measures: getBestUnit gracefully no-ops (no 'best' heuristic implemented for custom categories)", () => {
  test("returns the value and unit unchanged rather than throwing", () => {
    expect(getBestUnit(5000, "kV")).toEqual({ value: 5000, unit: "kV" });
    expect(getBestUnit(2, "mph")).toEqual({ value: 2, unit: "mph" });
  });
});
