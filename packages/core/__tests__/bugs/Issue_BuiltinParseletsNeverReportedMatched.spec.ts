import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

/**
 * Bug: the diagnostic "matched parselets" report (used by the playground's
 * Parselets tab to show which parselets fired vs. sat unused) permanently
 * showed 0 matches for the vast majority of ordinary expressions.
 *
 * Root cause: PrecedenceParser has two dispatch tiers. Tier 1 is an inline
 * switch/array-lookup fast path for built-in tokens (NUMBER, LPAREN, PLUS,
 * MINUS, STAR, IDENT, ...) that never touches the ParseletRegistry, for
 * performance. Tier 2 falls back to real registered Parselet objects for
 * everything else (function calls, dice, OSRS items, etc.). Only Tier 2
 * ever called fireParseletMatched() — so an expression like
 * `4 * (11 - 2) / sqrt(9)` reported only the FunctionCallParselet (sqrt) as
 * matched, while NUMBER, LPAREN, MINUS, and STAR — all clearly used —
 * showed as "unused".
 *
 * Fixed by looking up the (still-registered, just normally bypassed)
 * built-in parselet from the registry and firing the same diagnostic event
 * Tier 2 already fires, gated behind the existing `diagnosticPipeline`
 * check so it costs nothing outside diagnostic/playground mode.
 */
describe("Bug: built-in (Tier 1) parselets never appeared in the matched-parselets diagnostic report", () => {
  test("arithmetic built-ins (NUMBER, LPAREN, MINUS, STAR) are reported as matched", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, "4 * (11 - 2) / sqrt(9)");

    const matchedTokenTypes = new Set((result.debug?.parselets ?? []).map(p => p.tokenType));

    expect(matchedTokenTypes.has("NUMBER")).toBe(true);
    expect(matchedTokenTypes.has("LPAREN")).toBe(true);
    expect(matchedTokenTypes.has("MINUS")).toBe(true);
    expect(matchedTokenTypes.has("STAR")).toBe(true);
    // Tier 2 (plugin) parselets must still be reported too — no regression there.
    expect(matchedTokenTypes.has("FUNC")).toBe(true);
  });

  test("only tokens actually present in the expression are reported as matched", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, "4 * (11 - 2) / sqrt(9)");

    const matchedTokenTypes = new Set((result.debug?.parselets ?? []).map(p => p.tokenType));
    expect(matchedTokenTypes.has("PLUS")).toBe(false);
  });

  test("plain arithmetic with no plugin calls still reports every operator used", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.evaluateLineWithDebug(1, "1 + 2 - 3 * 4 / 5");

    const matchedTokenTypes = new Set((result.debug?.parselets ?? []).map(p => p.tokenType));
    expect(matchedTokenTypes.has("NUMBER")).toBe(true);
    expect(matchedTokenTypes.has("PLUS")).toBe(true);
    expect(matchedTokenTypes.has("MINUS")).toBe(true);
    expect(matchedTokenTypes.has("STAR")).toBe(true);
    expect(matchedTokenTypes.has("SLASH")).toBe(true);
  });

  test("diagnostic mode off (default) produces no parselet events at all (no overhead regression)", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLineWithDebug(1, "4 * (11 - 2) / sqrt(9)");
    expect(result.debug).toBeUndefined();
  });
});
