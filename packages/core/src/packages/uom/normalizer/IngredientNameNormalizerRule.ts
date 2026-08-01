import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";
import { MAX_INGREDIENT_NAME_WORDS } from "../data/IngredientDensities";

/**
 * Fuses a substance name (e.g. "butter", "olive oil", "unobtainium") into a
 * single `INGREDIENT_NAME` token — backs the cooking mass<->volume grammar
 * `<mass-or-volume> <substance> in <target-unit>` (e.g. "300g butter in
 * cups"). See `CookingConversionParselet.ts` for the infix parselet that
 * consumes this fused token, and `CookingPluginFunctions.ts` for the
 * density lookup (an unrecognized substance name fuses here just fine but
 * produces a clear `COOKING_UNKNOWN_INGREDIENT` error value at runtime —
 * this rule does NOT gate on `IngredientDensities.ts`'s table membership).
 *
 * WHY THIS IS A CONTEXT-SENSITIVE NORMALIZER RULE, NOT `IEnginePackage.phrases`:
 * `phrases` (the `PhraseTrie`) fuses a registered word/phrase EVERYWHERE it
 * appears in a token stream, unconditionally — that's exactly right for a
 * connector phrase like "tax on" (see `FinancePackage.ts`), but a substance
 * name here is an ordinary, plausible English word/variable name
 * ("butter", "sugar", "milk", "flour", ...) with NO connector to fuse it
 * onto (unlike "tax on"/"interest on", there's no natural second word that
 * always follows a substance name to disambiguate it from a bare
 * identifier). Registering these as bare phrase-trie entries would repeat
 * this session's exact "total"/"tax" bare-keyword regression (see
 * `packages/variables/parselets/VariableParselet.ts`'s doc comment) at a
 * much larger scale — `:butter = 4.99`, `:sugar = 2`, `:milk = 3` would
 * all silently break.
 *
 * Instead, this rule only fires in a narrowly-qualified CONTEXT:
 *   1. The token immediately BEFORE the candidate word(s) must be a real
 *      `UNIT` token (the amount's mass/volume unit, e.g. "g"/"cups") —
 *      never true for a bare `:butter = 5` variable definition.
 *   2. The token(s) immediately AFTER the candidate word(s) must be a
 *      literal `IN` keyword followed by a unit-like word (`UNIT` or
 *      `IDENT`) — never true for a bare identifier reference either.
 * Both conditions must hold, so a plain "butter" anywhere else in an
 * expression (variable name, arithmetic operand, whatever) is completely
 * unaffected and stays an ordinary `IDENT` token. Multi-word names (e.g.
 * "olive oil") are tried longest-first, up to
 * {@link MAX_INGREDIENT_NAME_WORDS} words -- the "followed by IN" check at
 * each candidate length is what correctly sizes the match (not a
 * known-ingredient lookup), so an as-yet-unrecognized multi-word substance
 * name is captured with the same accuracy as a recognized one.
 */
export function ingredientNameNormalizerRule(priority = 68): NormalizerRule {
  return {
    name: "uom-cooking:ingredient-name",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const prevToken = tokens[pos - 1];
      if (!prevToken || prevToken.type !== "UNIT") return null;

      for (let wordCount = MAX_INGREDIENT_NAME_WORDS; wordCount >= 1; wordCount--) {
        if (pos + wordCount > tokens.length) continue;

        const candidateTokens = tokens.slice(pos, pos + wordCount);
        if (!candidateTokens.every((t) => t.type === "IDENT")) continue;

        const afterIdx = pos + wordCount;
        const inToken = tokens[afterIdx];
        if (!inToken || inToken.type !== "IN") continue;
        const targetToken = tokens[afterIdx + 1];
        if (!targetToken || (targetToken.type !== "UNIT" && targetToken.type !== "IDENT")) continue;

        const candidate = candidateTokens.map((t) => t.value.toLowerCase()).join(" ");
        return {
          consumed: wordCount,
          replacement: [createFusedToken("INGREDIENT_NAME", candidate, candidateTokens)],
          ruleName: "uom-cooking:ingredient-name",
        };
      }
      return null;
    },
  };
}
