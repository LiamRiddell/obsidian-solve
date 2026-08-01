import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Fuses `NUMBER frames` (e.g. `10 frames`) into a single `FRAME_COUNT`
 * prefix token carrying the frame count as its value.
 *
 * "frames" is matched as a plain `IDENT` token (case-insensitive) — the
 * same approach {@link fpsRateNormalizerRule} uses for "fps" and
 * {@link clockTimeNormalizerRule} uses for "am"/"pm": deliberately NOT
 * added to the locale keywordMap or `lexer/units.ts`'s known-unit set, so
 * this doesn't change lexing for "frames" used elsewhere (e.g. as a
 * variable name), and the fusion only fires when it immediately follows a
 * number — a narrow, low-collision-risk trigger, not a general keyword
 * change.
 *
 * Backs BOTH the `<N> frames @ <fps>` -> timecode-string conversion (see
 * {@link FrameCountParselet}) AND plain `Uom(N, "frames")` duration values
 * used as the right-hand side of timecode arithmetic (`timecode + N
 * frames` — see `vm/VM.ts`'s `combineTimecode()`), since a bare `FRAME_COUNT`
 * with no trailing "@ fps" just becomes the latter.
 */
export function frameCountNormalizerRule(priority = 65): NormalizerRule {
  return {
    name: "time:frame-count",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const numberToken = tokens[pos];
      const framesToken = tokens[pos + 1];
      if (numberToken.type !== "NUMBER") return null;
      if (framesToken?.type !== "IDENT" || framesToken.value.toLowerCase() !== "frames") return null;

      return {
        consumed: 2,
        replacement: [createFusedToken("FRAME_COUNT", numberToken.value, tokens.slice(pos, pos + 2))],
        ruleName: "time:frame-count",
      };
    },
  };
}
