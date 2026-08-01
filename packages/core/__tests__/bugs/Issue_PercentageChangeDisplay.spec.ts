import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { formatValue } from "@solve-js/format/FormatEngine";

/**
 * Bug: percentage-change results ("800 to 1000") displayed as "0.25%"
 * instead of "25.00%".
 *
 * ValueType.Percentage stores a fraction (0.25 for 25%) — its sole
 * producer, VM.ts's TO_PERCENTAGE opcode, computes `right/left - 1`.
 * FormatEngine's formatPercentage() called `.toFixed()` on the raw
 * fraction without multiplying by 100 first, so every percentage-change
 * result was displayed 100x too small.
 *
 * Found live in the playground via the built-in "Percentage Calculations"
 * example, whose last line is `800 to 1000`.
 */
describe("Bug: percentage-change value displayed as fraction instead of percent", () => {
  test("800 to 1000 displays as 25.00%, not 0.25%", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "800 to 1000");
    const formatted = formatValue(result);
    expect(formatted).toContain("25");
    expect(formatted).not.toContain("0.25");
  });

  test("1000 to 800 (a decrease) displays as -20.00%, not -0.20%", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "1000 to 800");
    const formatted = formatValue(result);
    expect(formatted).toContain("-20");
    expect(formatted).not.toContain("-0.2");
  });
});
