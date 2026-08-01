import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Custom normalizer rule instead of IEnginePackage.phrases: the static
 * phrase trie only fuses fixed word sequences, with no slot for an
 * arbitrary NUMBER between two keyword words -- same class of problem as
 * uom/normalizer/IngredientNameNormalizerRule.ts and ClampParselet.ts.
 *
 * Also sidesteps a real collision: the currency package's InParselet is a
 * generic infix parselet on the bare IN token that unconditionally
 * consumes IN as soon as it's seen, even when the following token isn't a
 * valid conversion target (a bare NUMBER year is not) -- it silently
 * no-ops but has already eaten the IN token, stranding "YEAR dollars".
 * Fusing the whole span here, before parsing starts, removes the bare IN
 * token from the stream so InParselet never sees it.
 *
 * Only fires when dollars/dollar immediately follows the year, so forms
 * like "what is $X in YEAR1 worth in YEAR2" and "value of $X in YEAR
 * assuming N% inflation" (which also have a bare IN NUMBER, but not
 * followed by "dollars") are left alone for InflationQueryParselet /
 * InflationFutureValueParselet to consume directly -- see their own
 * binding-power guards against the same InParselet collision.
 *
 * "dollar"/"dollars" now lexes as a UNIT token (uom/CurrencyAliases.ts's
 * word-alias support, added to lexer/units.ts's knownUnits), not IDENT --
 * accept both token types here so this fusion still fires post-expansion.
 */
export function inYearDollarsNormalizerRule(priority = 70): NormalizerRule {
  return {
    name: "finance:in-year-dollars",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const inToken = tokens[pos];
      const yearToken = tokens[pos + 1];
      const dollarsToken = tokens[pos + 2];
      if (inToken.type !== "IN") return null;
      if (yearToken?.type !== "NUMBER") return null;
      if (dollarsToken?.type !== "IDENT" && dollarsToken?.type !== "UNIT") return null;
      const word = dollarsToken.value.toLowerCase();
      if (word !== "dollars" && word !== "dollar") return null;

      return {
        consumed: 3,
        replacement: [createFusedToken("IN_YEAR_DOLLARS", yearToken.value, tokens.slice(pos, pos + 3))],
        ruleName: "finance:in-year-dollars",
      };
    },
  };
}
