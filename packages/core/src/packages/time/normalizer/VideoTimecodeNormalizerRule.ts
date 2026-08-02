import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";
import { isInsideRangeContext } from "@solve-js/normalizer/BuiltinNormalizerRules";

/**
 * Fuses a video-timecode literal — `HH:MM:SS:FF`, always THREE colons —
 * into a single `VIDEO_TIMECODE` prefix token carrying its four numeric
 * fields as a comma-joined value (e.g. "1,2,3,4" for "01:02:03:04").
 *
 * Must run at HIGHER priority than {@link laptimeNormalizerRule} (a
 * lap-time is `HH:MM:SS`, TWO colons) so a genuine 4-group timecode gets a
 * chance to match all four number groups before the lap-time rule
 * greedily fuses just the first three — same reasoning
 * `laptimeNormalizerRule`'s own doc comment gives for outranking
 * `clockTimeNormalizerRule`.
 *
 * The frame-rate ("at 30 fps" / "@ 30 fps") is NOT part of this fusion —
 * it's consumed by {@link VideoTimecodeParselet} via lookahead after this
 * token, the same way {@link ClockTimeParselet} optionally consumes a
 * trailing timezone-conversion suffix. Requiring the fps to be specified
 * is enforced at parse time (a video timecode has no meaning without a
 * frame rate — SoulverCore requires it too), not here.
 */
export function videoTimecodeNormalizerRule(priority = 75): NormalizerRule {
  return {
    name: "time:video-timecode",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      // See ClockTimeNormalizerRule's identical guard — a video timecode
      // inside `[...]` has no legitimate meaning; reserved for matrix ranges.
      if (isInsideRangeContext(tokens, pos)) return null;
      const h = tokens[pos];
      const c1 = tokens[pos + 1];
      const m = tokens[pos + 2];
      const c2 = tokens[pos + 3];
      const s = tokens[pos + 4];
      const c3 = tokens[pos + 5];
      const f = tokens[pos + 6];

      if (h?.type !== "NUMBER") return null;
      if (c1?.type !== "COLON") return null;
      if (m?.type !== "NUMBER") return null;
      if (c2?.type !== "COLON") return null;
      if (s?.type !== "NUMBER") return null;
      if (c3?.type !== "COLON") return null;
      if (f?.type !== "NUMBER") return null;

      const hours = parseInt(h.value, 10);
      const minutes = parseInt(m.value, 10);
      const seconds = parseInt(s.value, 10);
      const frames = parseInt(f.value, 10);
      if ([hours, minutes, seconds, frames].some((n) => isNaN(n))) return null;
      if (minutes < 0 || minutes > 59) return null;
      if (seconds < 0 || seconds > 59) return null;
      if (hours < 0 || frames < 0) return null;

      return {
        consumed: 7,
        replacement: [
          createFusedToken("VIDEO_TIMECODE", `${hours},${minutes},${seconds},${frames}`, tokens.slice(pos, pos + 7)),
        ],
        ruleName: "time:video-timecode",
      };
    },
  };
}
