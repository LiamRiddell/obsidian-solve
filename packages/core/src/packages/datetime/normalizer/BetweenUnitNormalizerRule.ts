import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Fuses `UNIT BETWEEN` → a single `BETWEEN_UNIT` prefix token carrying the
 * unit name as its value (e.g. "days"), so `days between <a> and <b>`
 * parses.
 *
 * Same rationale as {@link untilSinceNormalizerRule}, which this mirrors
 * exactly: a bare `UNIT` in prefix position is already claimed by
 * VariablesPackage's IdentifierParselet, so the collision has to be
 * removed before parsing starts rather than resolved during it.
 *
 * Also swallows a preceding `how many` (`how many days between ...`,
 * `how many days until ...`). That reads as one phrase to a human but is
 * two ordinary identifier tokens to the lexer, and fusing them here — only
 * ever directly in front of a unit-plus-connector — keeps "how" and "many"
 * from becoming keywords that would shadow variables named either.
 */
export function betweenUnitNormalizerRule(priority = 60): NormalizerRule {
  return {
    name: "datetime:between-unit",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      // Optional leading "how many".
      let start = pos;
      let howManyLength = 0;
      if (
        tokens[pos]?.value?.toLowerCase() === "how" &&
        tokens[pos + 1]?.value?.toLowerCase() === "many"
      ) {
        start = pos + 2;
        howManyLength = 2;
      }

      const unitToken = tokens[start];
      const keywordToken = tokens[start + 1];
      if (!unitToken || !keywordToken) return null;
      if (unitToken.type !== "UNIT") return null;

      // "how many days until X" reuses the existing UNTIL_UNIT/SINCE_UNIT
      // tokens — this rule only has to drop the "how many" for those, since
      // untilSinceNormalizerRule then sees a plain `UNIT UNTIL` pair.
      const isBetween = keywordToken.type === "BETWEEN";
      const isUntilSince = keywordToken.type === "UNTIL" || keywordToken.type === "SINCE";
      if (!isBetween && !isUntilSince) return null;
      if (isUntilSince && howManyLength === 0) return null; // nothing for this rule to do

      const sources = tokens.slice(pos, start + 2);
      if (isUntilSince) {
        // Re-emit the pair untouched, minus the "how many".
        return {
          consumed: howManyLength + 2,
          replacement: [unitToken, keywordToken],
          ruleName: "datetime:how-many",
        };
      }

      return {
        consumed: howManyLength + 2,
        replacement: [createFusedToken("BETWEEN_UNIT", unitToken.value, sources)],
        ruleName: "datetime:between",
      };
    },
  };
}
