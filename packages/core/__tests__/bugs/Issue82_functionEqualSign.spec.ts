import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #82: Function expressions lose equal sign", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", true);
  });

  test("plain arithmetic returns correct formatted result with =", () => {
    const result = engine.evaluateLineWithDebug(1, "55/5");
    expect(result.value.toNumber()).toBe(11);
    // formatValue always prepends "= " — verify via debug metadata
    expect(result.debug!.metadata.expression).toBe("55/5");
  });

  test("function expression also returns correct value and preserves expression", () => {
    const result = engine.evaluateLineWithDebug(1, "round(55/5)");
    expect(result.value.toNumber()).toBe(11);
    expect(result.debug!.metadata.expression).toBe("round(55/5)");
  });

  test("sin(pi/2) returns 1", () => {
    const result = engine.evaluateLineWithDebug(1, "sin(pi/2)");
    expect(result.value.toNumber()).toBeCloseTo(1, 5);
    expect(result.debug!.metadata.expression).toBe("sin(pi/2)");
  });

  test("function in expression preserves = in formatted output", () => {
    const enginePlain = new ExpressionEngine("en", false);
    const [value] = enginePlain.evaluateLine(1, "round(55/5)");
    // Use formatValue to format like the plugin does
    const { formatValue } = require("@solve-js/format/FormatEngine");
    const formatted = formatValue(value);
    expect(formatted.startsWith("= ")).toBe(true);
    expect(formatted).toContain("11");
  });

  test("sin(pi/2)*2 maintains correct format", () => {
    const enginePlain = new ExpressionEngine("en", false);
    const [value] = enginePlain.evaluateLine(1, "sin(pi/2)*2");
    const { formatValue } = require("@solve-js/format/FormatEngine");
    const formatted = formatValue(value);
    expect(formatted.startsWith("= ")).toBe(true);
    expect(formatted).toContain("2");
  });

  test("5/3 with function prefix preserves expression", () => {
    const result = engine.evaluateLineWithDebug(1, "5/3");
    expect(result.debug!.metadata.expression).toBe("5/3");
    expect(result.value.toNumber()).toBeCloseTo(5 / 3, 10);
  });
});