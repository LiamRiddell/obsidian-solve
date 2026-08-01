import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Fuses `NUMBER fps` (e.g. `30 fps`) into a single `FPS_RATE` prefix
 * token carrying the frame rate as its value.
 *
 * "fps" is matched as a plain `IDENT` token (case-insensitive), the same
 * approach {@link clockTimeNormalizerRule} uses for "am"/"pm" — NOT
 * added to the locale keywordMap or `lexerVocabulary.units`, so it
 * doesn't change lexing for "fps" used elsewhere, and doesn't collide
 * with the shared `UomLiteralParselet` that owns generic `UNIT` tokens
 * (which has no concept of a rate — "30 fps" would otherwise become a
 * plain `Uom(30, "fps")`, not the `Rate(30, "frames", "s")` this domain
 * actually needs for `30 fps × 3 minutes` -> `5,400 frames`).
 */
export function fpsRateNormalizerRule(priority = 65): NormalizerRule {
  return {
    name: "time:fps-rate",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const numberToken = tokens[pos];
      const fpsToken = tokens[pos + 1];
      if (numberToken.type !== "NUMBER") return null;
      if (fpsToken?.type !== "IDENT" || fpsToken.value.toLowerCase() !== "fps") return null;

      return {
        consumed: 2,
        replacement: [createFusedToken("FPS_RATE", numberToken.value, tokens.slice(pos, pos + 2))],
        ruleName: "time:fps-rate",
      };
    },
  };
}
