import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Fuses `UNIT UNTIL` → a single `UNTIL_UNIT` prefix token, and
 * `UNIT SINCE` → a single `SINCE_UNIT` prefix token, carrying the unit
 * name as the fused token's value (e.g. "days").
 *
 * Why fuse instead of registering UNTIL/SINCE as infix parselets: a bare
 * `UNIT` token in prefix position (e.g. the "days" in "days until ...")
 * is already claimed by VariablesPackage's IdentifierParselet, which
 * treats it as a variable reference. By the time an infix parselet for
 * UNTIL/SINCE would run, the parser has already emitted (wrong) bytecode
 * for that bare UNIT as a variable lookup. Fusing at the normalizer stage
 * — before parsing starts — means prefix dispatch never sees a bare UNIT
 * in this position at all, avoiding any collision between the two
 * packages' UNIT handling.
 */
export function untilSinceNormalizerRule(priority = 60): NormalizerRule {
  return {
    name: "datetime:until-since",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      if (pos + 1 >= tokens.length) return null;
      const unitToken = tokens[pos];
      const keywordToken = tokens[pos + 1];
      if (unitToken.type !== "UNIT") return null;
      if (keywordToken.type !== "UNTIL" && keywordToken.type !== "SINCE") return null;

      const fusedType = keywordToken.type === "UNTIL" ? "UNTIL_UNIT" : "SINCE_UNIT";
      return {
        consumed: 2,
        replacement: [createFusedToken(fusedType, unitToken.value, [unitToken, keywordToken])],
        ruleName: `datetime:${keywordToken.type.toLowerCase()}`,
      };
    },
  };
}
