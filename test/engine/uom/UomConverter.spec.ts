import { describe, expect, test } from "@jest/globals";
import { resolveUnit, getMeasure, canConvert, convertUnit, unitAliases } from "@/engine/uom/UomConverter";

describe("resolveUnit", () => {
  test("returns same unit for known abbreviations", () => {
    expect(resolveUnit("mm")).toBe("mm");
    expect(resolveUnit("cm")).toBe("cm");
    expect(resolveUnit("m")).toBe("m");
  });

  test("maps aliases", () => {
    expect(resolveUnit("day")).toBe("d");
    expect(resolveUnit("days")).toBe("d");
    expect(resolveUnit("week")).toBe("week");
    expect(resolveUnit("mt")).toBe("t");
    expect(resolveUnit("mph")).toBe("m/h");
  });

  test("handles temperature case sensitivity", () => {
    expect(resolveUnit("c")).toBe("C");
    expect(resolveUnit("f")).toBe("F");
    expect(resolveUnit("k")).toBe("K");
  });

  test("lowercases input", () => {
    expect(resolveUnit("MM")).toBe("mm");
    expect(resolveUnit("KM")).toBe("km");
  });

  test("trims whitespace", () => {
    expect(resolveUnit("  cm  ")).toBe("cm");
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
    expect(getMeasure("c")).toBe("temperature");
    expect(getMeasure("f")).toBe("temperature");
    expect(getMeasure("k")).toBe("temperature");
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