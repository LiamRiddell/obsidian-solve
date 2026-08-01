import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

/**
 * End-to-end coverage for the extended (custom) UoM categories added in
 * ExtendedUnits.ts — Speed, Pace, Voltage, Current, Apparent Power,
 * Reactive Power, Reactive Energy, Volume Flow Rate, Parts-Per. These
 * categories don't exist in the `convert` package's MeasureKind set, so
 * they're only reachable at all if the lexer's `knownUnits` gate
 * (lexer/units.ts) recognizes the new symbols as UNIT tokens in the first
 * place — UomConverter.spec.ts covers the conversion math directly, this
 * file proves the whole pipeline (lexer → parser → VM) actually wires up
 * for real expression strings, the same failure mode caught in
 * Issue_CryptoUnitsUnrecognized.spec.ts.
 */
describe("Extended UoM categories: end-to-end", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test.each([
    "mph", "kph", "mps", "kn", "ft_s",
    "min_km", "min_mi",
    "mV", "kV", "A", "mA", "kA",
    "VA", "kVA", "MVA", "kvar", "Mvar", "varh", "kvarh", "Mvarh",
    "m3s", "m3h", "lps", "lpm", "gpm", "cfs",
    "ppm", "ppb", "ppt", "permille",
  ])("%s lexes as a UoM unit, not an undefined variable", (unit) => {
    expect(() => engine.evaluateLine(1, `1 ${unit}`)).not.toThrow();
    const [result] = engine.evaluateLine(1, `1 ${unit}`);
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe(unit);
  });

  test("convert 60 mph to kph", () => {
    const [result] = engine.evaluateLine(1, "convert 60 mph to kph");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("kph");
    expect(result.toNumber()).toBeCloseTo(96.56064, 5);
  });

  test("direct conversion shorthand: 1 kV to mV", () => {
    const [result] = engine.evaluateLine(1, "1 kV to mV");
    expect(result.toNumber()).toBeCloseTo(1_000_000, 6);
  });

  test("implicit-conversion arithmetic within the same extended measure", () => {
    const [result] = engine.evaluateLine(1, "500 mV + 1 kV");
    expect(result.type).toBe(ValueType.Uom);
    expect(result.unit).toBe("mV");
    expect(result.toNumber()).toBeCloseTo(1_000_500, 6);
  });

  test("arithmetic across incompatible extended measures surfaces an error, not a bare number", () => {
    const [result] = engine.evaluateLine(1, "1 kV + 1 A");
    expect(result.type).toBe(ValueType.Error);
  });

  test("apparent power, reactive power, and real power stay distinct measures", () => {
    expect(() => engine.evaluateLine(1, "1 VA to kW")).not.toThrow();
    const [result] = engine.evaluateLine(1, "1 VA to kW");
    // Cross-measure "to" conversion is a no-op that keeps the source unit
    // (mirrors existing UOM_CONVERT_TO behavior for any incompatible pair).
    expect(result.unit).toBe("VA");
  });

  test("volume flow rate: convert 1 cfs to lps", () => {
    const [result] = engine.evaluateLine(1, "convert 1 cfs to lps");
    expect(result.toNumber()).toBeCloseTo(28.3168466, 5);
  });

  test("parts-per: convert 1 permille to ppm", () => {
    const [result] = engine.evaluateLine(1, "convert 1 permille to ppm");
    expect(result.toNumber()).toBeCloseTo(1000, 10);
  });
});
