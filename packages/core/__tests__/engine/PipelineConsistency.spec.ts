/**
 * `ExpressionEngine.ts` has (had) two independent implementations of
 * "compile and execute one line": the diagnostic-instrumented path every
 * real `evaluateLine()`/`evaluateExpression()` call takes
 * (`evaluateExpressionWithDiagnostic()`), and the lean pre-tokenized path
 * (`evaluateLines()` -> `evaluateLineWithPreTokenized()` ->
 * `evaluateWithTokens()`). Both now delegate their front-half decision —
 * "what does this line mean" — to the SAME `prepareExpression()`, but this
 * test exists as a structural guard against that ever silently drifting
 * apart again: this exact class of bug (the `=>`/equation-statement grammar
 * shipping correct-and-tested on one path while being dead code on the
 * other, the REAL API path) shipped once this session and was only caught
 * by a dedicated test exercising the real `evaluateLine()` entry point.
 *
 * For every top-level grammar shape the engine currently recognizes, this
 * asserts the diagnostic path and the lean path produce the identical
 * formatted result for the same input.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { formatValue } from "@solve-js/format/FormatEngine";

/**
 * Evaluates `lines` on two independent engines — one via the real
 * `evaluateLine()` API (the diagnostic path), one via `evaluateLines()`
 * (the lean pre-tokenized path) — and returns the formatted result of the
 * LAST line from each, for comparison.
 */
function compareLastLine(lines: string[]): { diagnostic: string; lean: string } {
  const diagEngine = new ExpressionEngine("en");
  let diagResult = "";
  lines.forEach((line, i) => {
    const [v] = diagEngine.evaluateLine(i + 1, line);
    diagResult = formatValue(v);
  });

  const leanEngine = new ExpressionEngine("en");
  const parsed = leanEngine.evaluateLines(lines);
  const lastResult = parsed[parsed.length - 1].result;
  const leanResult = lastResult ? formatValue(lastResult) : "";

  return { diagnostic: diagResult, lean: leanResult };
}

describe("cross-pipeline consistency: diagnostic path vs. lean path", () => {
  test("ordinary arithmetic", () => {
    const { diagnostic, lean } = compareLastLine(["2+2"]);
    expect(diagnostic).toBe(lean);
    expect(diagnostic).toBe("= 4");
  });

  test("colon-prefixed assignment then read", () => {
    const { diagnostic, lean } = compareLastLine([":x = 5", ":x + 1"]);
    expect(diagnostic).toBe(lean);
    expect(diagnostic).toBe("= 6");
  });

  test("bare (colon-less) matrix assignment then read", () => {
    const { diagnostic, lean } = compareLastLine(["a = [1, 2; 3, 4]", "a[0,0] + a[1,1]"]);
    expect(diagnostic).toBe(lean);
    expect(diagnostic).toBe("= 5");
  });

  test("user-defined function definition then call", () => {
    const { diagnostic, lean } = compareLastLine(["f(x) = 2*x", "f(5)"]);
    expect(diagnostic).toBe(lean);
    expect(diagnostic).toBe("= 10");
  });

  test("=> general simplify mode", () => {
    const { diagnostic, lean } = compareLastLine(["1+2+b+3+b =>"]);
    expect(diagnostic).toBe(lean);
    expect(diagnostic).toBe("2b+6");
  });

  test("bare equation-statement then => solve", () => {
    const { diagnostic, lean } = compareLastLine(["a = [1, 2; 3, 4]", "a*x = [60; 70]", "x =>"]);
    expect(diagnostic).toBe(lean);
  });
});
