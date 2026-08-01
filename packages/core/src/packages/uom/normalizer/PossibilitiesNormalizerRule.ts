import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Fuses `UNIT TO QUESTION` (e.g. `cm to ?`) into a single
 * `UOM_POSSIBILITIES_QUERY` prefix token carrying the source unit name.
 *
 * Why fuse instead of a plain prefix parselet on UNIT: a bare `UNIT`
 * token in prefix position (the "cm" in "cm to ?", with no preceding
 * magnitude) is already claimed by VariablesPackage's IdentifierParselet,
 * which treats it as a variable reference — same collision reasoning as
 * datetime's `UntilSinceNormalizerRule`. Fusing at the normalizer stage
 * means prefix dispatch never sees a bare UNIT in this position.
 */
export function uomPossibilitiesNormalizerRule(priority = 60): NormalizerRule {
  return {
    name: "uom:possibilities",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      if (pos + 2 >= tokens.length) return null;
      const unitToken = tokens[pos];
      const toToken = tokens[pos + 1];
      const questionToken = tokens[pos + 2];
      if (unitToken.type !== "UNIT") return null;
      if (toToken.type !== "TO") return null;
      if (questionToken.type !== "QUESTION") return null;

      return {
        consumed: 3,
        replacement: [createFusedToken("UOM_POSSIBILITIES_QUERY", unitToken.value, [unitToken, toToken, questionToken])],
        ruleName: "uom:possibilities",
      };
    },
  };
}
