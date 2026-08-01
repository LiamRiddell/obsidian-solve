import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";

export const DATETIME_LITERAL_TYPE = "DATETIME_LITERAL";
const DATETIME_LITERAL_TYPE_ID = tokenTypeId(DATETIME_LITERAL_TYPE);

/** A pure digit string — guards against fusing hex/scientific/bigint-suffixed NUMBER tokens. */
const PLAIN_INTEGER = /^\d+$/;

/** First NUMBER token of a dot-separated literal: the lexer's decimal scanner
 * merges "DD.MM" into one float-shaped token (see module doc below). */
const DOT_DAY_MONTH = /^\d{1,2}\.\d{1,2}$/;

/** Second NUMBER token of a dot-separated literal: the lexer re-enters
 * tokenizeNumber() AT the second dot, so the year keeps its leading dot. */
const DOT_LEADING_YEAR = /^\.(\d{2}|\d{4})$/;

/**
 * Resolves a year token's raw digit text to a 4-digit year.
 *
 * Accepts exactly 2 or 4 digits (matching the wiki's documented formats).
 * A 2-digit year is windowed using the common glibc `strptime("%y")`
 * convention: 00-68 -> 2000-2068, 69-99 -> 1969-1999. Any other digit
 * count (1 or 3 digits) is not a valid year shape and returns null so the
 * caller can decline the match and fall back to ordinary arithmetic.
 */
function resolveYear(digits: string): number | null {
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) {
    const yy = Number(digits);
    return yy <= 68 ? 2000 + yy : 1900 + yy;
  }
  return null;
}

/**
 * Converts a validated day/month/year triple into a fused DATETIME_LITERAL
 * token, or null if the triple isn't a real calendar date (e.g. "30" for
 * February) — letting the caller fall back to treating the source tokens
 * as ordinary arithmetic instead of a date.
 */
function buildDateToken(
  day: number,
  month: number,
  year: number,
  sourceTokens: Token[],
  ruleName: string,
): NormalizerMatch | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Local midnight — consistent with formatDatetime()'s toLocaleString()
  // display and DATE_NOW's Date.now() epoch, both of which are local-time.
  const date = new Date(year, month - 1, day);
  // Reject calendar rollover (e.g. day=30 in February) rather than silently
  // normalizing to March 2 — a rollover almost always means the tokens were
  // never a date to begin with (e.g. "2-30-5" as chained subtraction).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  const first = sourceTokens[0];
  const text = sourceTokens.map((t) => t.value).join("");
  const fusedToken = new LexerToken(
    DATETIME_LITERAL_TYPE,
    DATETIME_LITERAL_TYPE_ID,
    String(date.getTime()),
    text,
    first.offset,
    0,
    first.line,
    first.col,
  );

  return { consumed: sourceTokens.length, replacement: [fusedToken], ruleName };
}

/**
 * NormalizerRule that fuses numeric date literals into a single
 * DATETIME_LITERAL token, per the documented "Datetime Formats":
 * - European: DD/MM/YYYY  (5 tokens: NUMBER SLASH NUMBER SLASH NUMBER)
 * - US:       MM-DD-YYYY  (5 tokens: NUMBER MINUS NUMBER MINUS NUMBER)
 * - ISO 8601: YYYY-MM-DD  (same 5-token shape as US, disambiguated by the
 *             first group being exactly 4 digits)
 * - Dot:      DD.MM.YYYY  (2 tokens — see below)
 *
 * ## Why the dot format is a 2-token window, not 5
 * ExpressionLexer's tokenizeNumber() treats "." adjacent to digits on both
 * sides as a decimal point, not a separator. For "25.12.2023" the lexer
 * itself emits only two NUMBER tokens: "25.12" (day+month merged into one
 * float-shaped literal) and ".2023" (the lexer re-enters number scanning
 * AT the second dot, so the year keeps a leading dot). There is no 5-token
 * NUMBER-DOT-NUMBER-DOT-NUMBER shape to match against — the fusion has to
 * happen post-hoc from that 2-token shape instead. This only works for the
 * literal typed with no internal whitespace (e.g. "25.12.2023"); a spaced
 * variant ("25 .12 .2023") produces three separate leading-dot tokens and
 * is intentionally not supported — out of scope for the documented format.
 *
 * ## Ambiguity with existing arithmetic
 * A date-shaped SLASH or MINUS chain (e.g. "25/12/2023" or "12-25-2023")
 * previously parsed as chained division/subtraction. This rule
 * deliberately reinterprets any such chain that resolves to a real
 * calendar date as a date literal instead, matching the documented
 * behavior. Chains that aren't valid dates (out-of-range day/month, a
 * February 30, a non-2/4-digit year) fall through unchanged.
 *
 * ## Relationship to Iso8601.ts / DatePhrase.ts
 * This is the general-purpose "bare numeric date literal" implementation
 * those two files' doc comments referenced as landing on a sibling branch
 * (`feat/safety-limits-datetime-literals`) — now ported here. It's
 * intentionally independent of both: `Iso8601.ts` only parses QUOTED
 * STRING literals (`"2019-04-01..." to date`), and the Stocks package's
 * `DatePhrase.ts` is a narrower, deliberately-diverging grammar (US-style
 * bare SLASH dates, 4-digit-year-only) scoped to stock-history queries —
 * neither of those needed to change for this to land.
 */
export function dateLiteralNormalizerRule(): NormalizerRule {
  return {
    name: "datetime:date-literal",
    priority: 70,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      const t0 = tokens[pos];
      if (t0.type !== "NUMBER") return null;

      // ── Dot format: 2-token window (see module doc) ──────────────────
      if (DOT_DAY_MONTH.test(t0.value)) {
        const t1 = tokens[pos + 1];
        if (t1 && t1.type === "NUMBER" && DOT_LEADING_YEAR.test(t1.value)) {
          const [dayText, monthText] = t0.value.split(".");
          const year = resolveYear(t1.value.slice(1));
          if (year !== null) {
            const match = buildDateToken(
              Number(dayText), Number(monthText), year,
              [t0, t1], "datetime:date-literal:dot",
            );
            if (match) return match;
          }
        }
        return null;
      }

      // ── Slash / minus format: 5-token window ─────────────────────────
      if (!PLAIN_INTEGER.test(t0.value)) return null;
      const sep1 = tokens[pos + 1];
      if (!sep1 || (sep1.type !== "SLASH" && sep1.type !== "MINUS")) return null;
      const t1 = tokens[pos + 2];
      const sep2 = tokens[pos + 3];
      const t2 = tokens[pos + 4];
      if (!t1 || t1.type !== "NUMBER" || !PLAIN_INTEGER.test(t1.value)) return null;
      if (!sep2 || sep2.type !== sep1.type) return null;
      if (!t2 || t2.type !== "NUMBER" || !PLAIN_INTEGER.test(t2.value)) return null;

      const sourceTokens = [t0, sep1, t1, sep2, t2];

      if (sep1.type === "SLASH") {
        // European: DD/MM/YYYY (always — no ISO-slash variant is documented)
        const year = resolveYear(t2.value);
        if (year === null) return null;
        return buildDateToken(Number(t0.value), Number(t1.value), year, sourceTokens, "datetime:date-literal:european");
      }

      // MINUS: ISO (YYYY-MM-DD) if the first group is exactly 4 digits, else US (MM-DD-YYYY)
      if (t0.value.length === 4) {
        // year=t0, month=t1, day=t2 — buildDateToken takes (day, month, year)
        return buildDateToken(Number(t2.value), Number(t1.value), Number(t0.value), sourceTokens, "datetime:date-literal:iso");
      }
      const year = resolveYear(t2.value);
      if (year === null) return null;
      // month=t0, day=t1, year=t2 — buildDateToken takes (day, month, year)
      return buildDateToken(Number(t1.value), Number(t0.value), year, sourceTokens, "datetime:date-literal:us");
    },
  };
}
