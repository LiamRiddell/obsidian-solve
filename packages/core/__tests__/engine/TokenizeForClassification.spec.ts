import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

/**
 * ExpressionEngine.tokenizeForClassification() — a lex+normalize-only
 * preview used by hosts (see packages/playground-bridge's
 * shouldEvaluateLine()) to decide whether a line "looks like" a real
 * expression without paying for a full parse/compile/VM pass. The key
 * property under test: the first normalized token's type is either the
 * generic IDENT fallback (proves nothing — any unrecognized word lexes as
 * IDENT) or a specific, registered keyword/fused-phrase type (proves the
 * lexer/normalizer actually recognized this as real vocabulary).
 */
describe("ExpressionEngine.tokenizeForClassification", () => {
  test("a multi-word fused phrase normalizes to its own specific token type, not IDENT", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("weather in Tokyo");
    expect(tokens[0].type).toBe("WEATHER_IN");
  });

  test("an unrecognized bare word normalizes to the generic IDENT fallback", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("hello");
    expect(tokens[0].type).toBe("IDENT");
  });

  test("genuine prose's leading word is also just IDENT — proves nothing on its own", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("Hello my name is dave");
    expect(tokens[0].type).toBe("IDENT");
  });

  test("a bare single-word keyword normalizes to its own token type", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("now");
    expect(tokens[0].type).toBe("NOW");
  });

  test("if/then/else keywords normalize to their own token types even with no digits", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("if true then true else false");
    expect(tokens[0].type).toBe("IF");
  });

  test("a numeric expression's first token is NUMBER, not IDENT", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("10 + 5");
    expect(tokens[0].type).toBe("NUMBER");
  });

  test("an empty string produces no tokens", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.tokenizeForClassification("")).toEqual([]);
  });

  test("whitespace-only input produces no meaningful tokens", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("   ").filter(
      (t) => t.type !== "WS" && t.type !== "NEWLINE"
    );
    expect(tokens).toEqual([]);
  });

  test("does not mutate engine state — safe to call speculatively before deciding to evaluate", () => {
    const engine = new ExpressionEngine("en");
    engine.tokenizeForClassification("weather in Tokyo");
    // A real evaluation of an unrelated expression afterwards must still
    // work correctly — proves the classification preview didn't leave the
    // lexer/normalizer in a bad state.
    const [value] = engine.evaluateExpression("10 + 5");
    expect(value.toNumber()).toBe(15);
  });

  test("multi-word city names in the Time package's zone table also fuse correctly", () => {
    const engine = new ExpressionEngine("en");
    const tokens = engine.tokenizeForClassification("time difference between Seattle and Moscow");
    expect(tokens[0].type).toBe("TIME_DIFFERENCE_BETWEEN");
  });
});
