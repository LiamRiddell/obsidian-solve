import { Parser } from "@solve-js/parser/Parser";
import { ZONE_LOOKUP } from "../../timezones/CityZones";
import { encodeFixedOffset, zoneLabel } from "../../timezones/ZoneMath";

/** A resolved zone reference plus the display text the user actually typed. */
export interface ZoneReference {
  /** IANA zone identifier, or a fixed-offset encoding — see `ZoneMath.ts`. */
  zoneRef: string;
  /**
   * What to show the user for this zone, e.g. in "time difference"
   * output. The user's OWN raw text, title-cased, when they named a
   * city/abbreviation/country (so "Seattle" and "Los Angeles" — both
   * `America/Los_Angeles` — each keep their own label instead of
   * collapsing to whichever one the IANA identifier happens to be named
   * after). Falls back to `zoneLabel(zoneRef)`'s derived label
   * (e.g. "UTC+8") for the numeric GMT/UTC-offset form, where there's no
   * more specific name to prefer.
   */
  displayName: string;
}

/**
 * Consume a "zone reference" from the parser if one is present — a city,
 * country, or standard-abbreviation name (`ZONE_LOOKUP`, matched by raw
 * token text regardless of whether it's a bare `IDENT` or a phrase-fused
 * `CITY_NAME` token — see `TimePackage.ts`'s `phrases` field for the
 * multi-word cities), or a numeric `GMT+N`/`UTC-N[:MM]` offset (a
 * multi-token form: an IDENT "gmt"/"utc", then an optional sign +
 * number + optional `:MM`).
 *
 * Returns `null` and consumes NOTHING if the next token doesn't match
 * either shape — callers must check for `null` before assuming a zone
 * reference was found, since (unlike most of this codebase's phrase
 * parsing) this helper is deliberately speculative: it only commits
 * (consumes tokens) once it's confident, so a caller can safely use it to
 * decide "is a zone-conversion suffix present at all" without needing
 * backtracking (this parser has none — `BytecodeBuilder` is append-only).
 */
export function tryConsumeZoneReference(parser: Parser): ZoneReference | null {
  const token = parser.peek();
  if (!token) return null;

  const rawText = token.value;
  const lowerText = rawText.toLowerCase();

  if (lowerText === "gmt" || lowerText === "utc") {
    parser.consume();
    const signToken = parser.peek();
    if (signToken?.type === "PLUS" || signToken?.type === "MINUS") {
      const isNegative = signToken.type === "MINUS";
      parser.consume();

      // "8:30" between the sign and a following word (e.g. "in Paris") has
      // already been fused into a single CLOCK_TIME token by the lexer's
      // clock-time normalizer (see ClockTimeNormalizerRule.ts) before this
      // parselet ever runs, so a bare NUMBER never appears in that case —
      // the fused token's value IS already hour*60+minute, matching
      // `totalMinutes` below exactly, so it can be used as-is.
      const offsetToken = parser.peek();
      let totalMinutes: number;
      if (offsetToken?.type === "CLOCK_TIME") {
        parser.consume();
        totalMinutes = parseInt(offsetToken.value, 10);
      } else {
        const hourToken = parser.consume("NUMBER");
        totalMinutes = parseInt(hourToken.value, 10) * 60;
        if (parser.peek()?.type === "COLON") {
          parser.consume();
          const minuteToken = parser.consume("NUMBER");
          totalMinutes += parseInt(minuteToken.value, 10);
        }
      }
      const zoneRef = encodeFixedOffset(isNegative ? -totalMinutes : totalMinutes);
      return { zoneRef, displayName: zoneLabel(zoneRef) };
    }
    const zoneRef = encodeFixedOffset(0); // bare "GMT"/"UTC" = zero offset
    return { zoneRef, displayName: zoneLabel(zoneRef) };
  }

  const zoneRef = ZONE_LOOKUP[lowerText];
  if (zoneRef) {
    parser.consume();
    const displayName = rawText.replace(/\b\w/g, (c) => c.toUpperCase());
    return { zoneRef, displayName };
  }

  return null;
}
