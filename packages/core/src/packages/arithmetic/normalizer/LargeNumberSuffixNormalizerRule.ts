import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { createFusedToken } from "@solve-js/normalizer/TokenNormalizer";

/**
 * Single-letter magnitude suffixes recognized immediately after a NUMBER
 * literal, and the power-of-ten each one scales by.
 *
 * Case matters — this is deliberately NOT case-insensitive:
 * - `k` (lowercase only) = thousand. Uppercase `K` is left alone (not
 *   requested, and unlike the others below there's no existing-unit
 *   collision reason to avoid it — just staying narrowly scoped to what
 *   was asked).
 * - `M` (uppercase only) = million. Lowercase `m` is the "meter" unit
 *   (`knownUnits` in `lexer/units.ts`) and must NOT be reinterpreted —
 *   `5m` stays 5 meters.
 * - `G`/`B` (uppercase only) = billion, accepted as synonyms (`$5B` and
 *   `5G` both read as "5 billion" — SoulverCore-style). Lowercase `g`
 *   (gram) and `b` (bit, see `knownUnits`) are untouched.
 * - `T` (uppercase only) = trillion. Lowercase `t` is the "tonne" unit.
 *
 * **Known, accepted collision**: bare uppercase `B` is ALSO a registered
 * unit symbol in `knownUnits` (data-storage "bytes", e.g. so `5GB`/`5MB`
 * keep working — those lex as a single two-letter `UNIT` token, "GB"/"MB",
 * completely distinct from the bare one-letter "B" this rule matches, so
 * they're unaffected either way). But a BARE `5B` was, before this rule,
 * a valid (if obscure) "5 bytes" `Uom` literal — confirmed via a real
 * lexer probe: `"5B"` tokenizes as `NUMBER "5"` + `UNIT "B"`, immediately
 * adjacent. This rule has higher priority than UOM parsing and
 * unconditionally reinterprets that exact shape as "5 billion" instead.
 * Deliberate, not an oversight: grepping the full test suite and
 * `uom/UomConverter.ts`'s real conversion table found zero test coverage
 * or real conversion-table entries for a BARE (non-prefixed) byte unit —
 * only the compound forms (`KB`/`MB`/`GB`/`TB`) are ever exercised or
 * documented — while "$5B"/"5B" for "5 billion" is the far more common,
 * expected reading (this is exactly the SoulverCore-style feature being
 * added here). If a real bare-bytes use case surfaces later, it would
 * need a different, explicit spelling (`5 B` with a space still lexes as
 * two tokens and is untouched, or `5 bytes`).
 *
 * Multi-letter lookalikes (`Mi`, `MB`, `km`, `kg`, ...) are automatically
 * excluded without any extra lookahead: the lexer already tokenizes them
 * as a single, longer `IDENT`/`UNIT` token (confirmed by direct lexer
 * probe), so their `.value` never equals one of the single-character keys
 * below — there's no separate trailing-letter token to accidentally
 * consume.
 */
const SUFFIX_MAGNITUDE: Record<string, number> = {
  k: 3,
  M: 6,
  G: 9,
  B: 9,
  T: 12,
};

/**
 * Plain unsigned decimal literal — digits, with at most one "." — as
 * produced by the lexer's ordinary NUMBER scanning. Deliberately excludes
 * `0x`/`0X` hex and `0b`/`0B` binary literals (also lexed as type
 * `NUMBER`, e.g. `"0xFF"`) and the multi-dot chained-thousands form
 * (`"1.234.567"`, see `NumberParselet.ts`'s `CHAINED_DOT_THOUSANDS_GROUPS`)
 * — none of those are meaningful inputs to decimal-point shifting, and
 * blindly string-shifting `"0xFF"` would silently corrupt it into a
 * different, wrong hex literal instead of erroring.
 */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Shift a plain decimal digit-string's decimal point right by `magnitude`
 * places, entirely via string manipulation — NOT `rawValue * 10**magnitude`.
 *
 * Naive floating-point multiplication silently produces wrong results for
 * inputs like `1.005 * 1000` (`1004.9999999999999` in IEEE-754 double
 * precision, not the exact `1005`), which is exactly the class of "wrong
 * answer with no error" bug this codebase treats as a real bug elsewhere
 * (see `BytecodeBuilder`'s constant-pool overflow fix). Moving the decimal
 * point through the digit string sidesteps floating-point entirely and is
 * always exact.
 *
 * @param raw Unsigned decimal digit-string as produced by the lexer's
 *   NUMBER token (e.g. "2.5", "10", "1.005") — never signed, never
 *   locale-separated (this rule reads the raw pre-locale-normalization
 *   token text, same as the lexer emits it).
 * @param magnitude Number of decimal places to shift right (3/6/9/12).
 */
function scaleDecimalString(raw: string, magnitude: number): string {
  const dotIdx = raw.indexOf(".");
  const intPart = dotIdx === -1 ? raw : raw.slice(0, dotIdx);
  let fracPart = dotIdx === -1 ? "" : raw.slice(dotIdx + 1);

  if (fracPart.length < magnitude) {
    fracPart = fracPart.padEnd(magnitude, "0");
  }

  const shiftedInt = intPart + fracPart.slice(0, magnitude);
  const remainingFrac = fracPart.slice(magnitude);

  return remainingFrac ? `${shiftedInt}.${remainingFrac}` : shiftedInt;
}

/**
 * Fuses `NUMBER` + an immediately-adjacent large-number magnitude suffix
 * (`k`/`M`/`G`/`B`/`T`, see {@link SUFFIX_MAGNITUDE}) into a single
 * `NUMBER` token carrying the fully-scaled value — e.g. `2.5k` becomes
 * indistinguishable from typing `2500` directly, all the way down to
 * emitting through the exact same `PUSH_NUMBER` opcode path (see
 * `PrecedenceParser.ts`'s `NUMBER_ID` fast path).
 *
 * Adjacency is required and checked via source offsets, NOT just token
 * order: `2.5 k` (a space before the suffix) must NOT fuse — confirmed by
 * a real lexer probe that `"2.5k"` and `"2.5 k"` both tokenize as
 * `NUMBER` + `IDENT "k"`, differing only in the `IDENT` token's `offset`
 * (immediately following the number's last character vs. one past it).
 * Without this check, a bare "the letter k as its own word" a few tokens
 * later could never realistically follow a number directly, but a
 * deliberately-spaced `2.5 k` (e.g. someone starting to type a unit that
 * doesn't exist) would otherwise be silently reinterpreted as 2500.
 */
export function largeNumberSuffixNormalizerRule(priority = 65): NormalizerRule {
  return {
    name: "arithmetic:large-number-suffix",
    priority,
    match(tokens, pos): NormalizerMatch | null {
      const numberToken = tokens[pos];
      if (numberToken.type !== "NUMBER") return null;
      if (!PLAIN_DECIMAL.test(numberToken.text)) return null;

      const suffixToken = tokens[pos + 1];
      if (!suffixToken) return null;
      // Suffix must be a word-shaped token (IDENT for k/M/G/T, or UNIT for
      // bare "B" — already a registered unit symbol, see the collision
      // note on SUFFIX_MAGNITUDE above) sitting immediately adjacent to
      // the number, with no whitespace in between.
      if (suffixToken.type !== "IDENT" && suffixToken.type !== "UNIT") return null;
      if (numberToken.offset + numberToken.text.length !== suffixToken.offset) return null;

      const magnitude = SUFFIX_MAGNITUDE[suffixToken.value];
      if (magnitude === undefined) return null;

      const scaled = scaleDecimalString(numberToken.text, magnitude);
      return {
        consumed: 2,
        replacement: [createFusedToken("NUMBER", scaled, tokens.slice(pos, pos + 2))],
        ruleName: "arithmetic:large-number-suffix",
      };
    },
  };
}
