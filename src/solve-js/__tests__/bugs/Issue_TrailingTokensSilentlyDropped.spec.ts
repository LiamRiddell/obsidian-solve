import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

/**
 * Bug (found via adversarial QA probing): parseExpression() stopped as soon
 * as it had one complete top-level expression — it never checked whether
 * that consumed the WHOLE token list for the line. Any leftover tokens (a
 * stray trailing number, a typo'd second operand with a missing operator,
 * a malformed "thousands"-looking literal) were silently discarded instead
 * of surfaced:
 *   - "5 3" evaluated to a confident "5" (the "3" was dropped)
 *   - "5 + 3 7" evaluated to "8" (the "7" was dropped)
 *   - "1,2345" evaluated to "1" (everything after the first digit was
 *     dropped — not even a thousands-group match)
 * with no error and no indication anything was wrong.
 *
 * Fixed in ExpressionEngine.ts's private parseExpression() by checking
 * parser.peek() after parsing and throwing UNEXPECTED_TRAILING_TOKEN if
 * any tokens remain unconsumed.
 *
 * This fix also affects prepareExpression()'s reads/writes extraction on
 * failure — see the ThreeTierEvaluator DAG-reads fix (ExpressionEngine.ts's
 * compileExpression() now attaches reads/writes to the thrown error's
 * context so callers tracking dependencies don't lose them just because the
 * expression failed to compile).
 *
 * Multi-target comma syntax ("10 USD in EUR, GBP" → 2 results) used to be
 * special-cased around this fix (split before parsing, so the comma was
 * never "trailing"). That splitting feature has since been removed
 * entirely — see the last test below — so a trailing comma is now just
 * another instance of this same bug class.
 */
describe("Bug: trailing tokens after a complete expression were silently dropped", () => {
  test.each([
    ["5 3", "3"],
    ["5 + 3 7", "7"],
    ["1,2345", ","],
    ["5, 3", ","],
    ["5 5 5", "5"],
  ])("%s throws UNEXPECTED_TRAILING_TOKEN instead of silently evaluating a partial result", (expression, leftoverToken) => {
    const engine = new ExpressionEngine("en", false);
    expect(() => engine.evaluateLine(1, expression)).toThrow(
      `Unexpected token after expression: "${leftoverToken}"`
    );
  });

  test("well-formed expressions are unaffected", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "5 + 3");
    expect(result.toNumber()).toBe(8);
  });

  test("genuine thousands-grouped numbers are unaffected", () => {
    const engine = new ExpressionEngine("en", false);
    const [result] = engine.evaluateLine(1, "1,234");
    expect(result.toNumber()).toBe(1234);
  });

  test("multi-target comma syntax ('X in Y, Z') is not special-cased — it's a trailing-token error like any other", () => {
    const engine = new ExpressionEngine("en", false);
    expect(() => engine.evaluateLine(1, "10 USD in EUR, GBP")).toThrow(
      'Unexpected token after expression: ","'
    );
  });
});
