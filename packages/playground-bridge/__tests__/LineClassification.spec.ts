import { describe, expect, test } from "@jest/globals";
import { runEngine } from "@bridge/engine";

/**
 * shouldEvaluateLine()'s prose gate used to reject every all-word line with
 * no digit/symbol as prose, even genuine expressions like "weather in
 * Tokyo" or "time in Paris" — nothing about those two lines LOOKS different
 * from "Hello my name is dave" under a pure regex heuristic. Fixed by
 * confirming the guess against the real lexer/normalizer
 * (ExpressionEngine.tokenizeForClassification()) before giving up: a line
 * whose first normalized token is anything other than the generic IDENT
 * fallback is proven, registered vocabulary, not a coin-flip guess.
 *
 * These tests exercise the fix through runEngine() (the real playground/
 * webapp entry point), not the private shouldEvaluateLine() directly — a
 * skipped line simply produces no lineResults entry at all.
 */
describe("shouldEvaluateLine — all-word expressions with no digit/symbol", () => {
  test("weather in <city> is evaluated, not silently skipped as prose", () => {
    const result = runEngine("weather in Tokyo");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].expression).toBe("weather in Tokyo");
  });

  test("temperature in <city> is evaluated", () => {
    const result = runEngine("temperature in Berlin");
    expect(result.lineResults).toHaveLength(1);
  });

  test("time in <city> is evaluated (no network, deterministic)", () => {
    const result = runEngine("time in Paris");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].error).toBeUndefined();
    expect(result.lineResults[0].type).not.toBe("Error");
  });

  test("date in <city> is evaluated", () => {
    const result = runEngine("date in Vancouver");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].error).toBeUndefined();
  });

  test("time difference between <city> and <city> is evaluated", () => {
    const result = runEngine("time difference between Seattle and Moscow");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].error).toBeUndefined();
    expect(result.lineResults[0].result).toContain("Seattle");
  });

  test("a pure-keyword conditional with no digits/symbols is evaluated", () => {
    const result = runEngine("if true then true else false");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].result).toBe("= true");
  });

  test("average of <words> without digits still correctly rejected (no numeric operands to aggregate)", () => {
    // Sanity check the fix isn't over-broad: "average of" alone fuses to a
    // real AVERAGE_OF token, but with no numbers following it, evaluation
    // itself should fail (or be filtered) — proving the fix only changes
    // whether a line REACHES the engine, not whether the engine accepts
    // objectively invalid input.
    const result = runEngine("average of nothing at all");
    if (result.lineResults.length > 0) {
      expect(result.lineResults[0].type === "Error" || result.lineResults[0].error).toBeTruthy();
    }
  });
});

describe("shouldEvaluateLine — genuine prose remains skipped", () => {
  test.each([
    "Hello my name is dave",
    "This is just a note to self",
    "The quick brown fox jumps over the lazy dog",
    "Remember to buy milk tomorrow",
  ])("%s produces no lineResults entry", (line) => {
    const result = runEngine(line);
    expect(result.lineResults).toHaveLength(0);
  });
});

describe("shouldEvaluateLine — unaffected regressions", () => {
  test("digit-bearing arithmetic still evaluates", () => {
    const result = runEngine("10 + 5 * 2");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].result).toBe("= 20");
  });

  test("single bare keyword (no space) still evaluates", () => {
    const result = runEngine("now");
    expect(result.lineResults).toHaveLength(1);
    expect(result.lineResults[0].error).toBeUndefined();
  });

  test("a single unrecognized bare word is still silently dropped, not surfaced as an error", () => {
    const result = runEngine("banana");
    expect(result.lineResults).toHaveLength(0);
  });
});
