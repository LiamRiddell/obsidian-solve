//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * Built-in normalization rules for the {@link TokenNormalizer}.
 *
 * These rules handle common expression patterns that span multiple tokens.
 * Phrase fusion (e.g., "to the power of" → CARET) is handled by the
 * internal {@link PhraseTrie} — see {@link TokenNormalizer.addPhrase}.
 * This module only exports non-phrase rules like {@link implicitMultiplyRule}.
 *
 * @module BuiltinNormalizerRules
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "./NormalizerRule";

//#endregion
//#region ─── PHRASE_START_WORDS — Implicit Multiply Guard ─────────────────────

/**
 * Words that can start multi-word phrases — hardcoded fallback.
 *
 * This is ONLY used as the default fallback in {@link implicitMultiplyRule}
 * when no `canStart` predicate is provided. In the recommended pattern,
 * the {@link PhraseTrie}'s live `canStart()` set is passed instead, keeping
 * the guard in sync with package-registered phrases.
 *
 * @see {@link TokenNormalizer.canStartPhrase}
 */
const PHRASE_START_WORDS = new Set([
  "to", "power", "increase", "decrease", "times", "multiply", "divide", "by",
]);

//#endregion
//#region ─── implicitMultiplyRule — Implicit Operator Insertion ────────────────

/**
 * Creates a normalization rule that inserts an implicit multiplication operator
 * between adjacent tokens where multiplication is implied.
 *
 * ## When it fires
 * Inserts a STAR token between:
 * - `NUMBER IDENT` (e.g., "2 x" → "2 * x")
 * - `RPAREN IDENT` (e.g., "(x+1)y" → "(x+1) * y")
 * - `NUMBER LPAREN` (e.g., "2(x+1)" → "2 * (x+1)")
 * - `NUMBER PI` / `NUMBER E` (e.g., "2π" → "2 * π")
 *
 * ## When it doesn't fire
 * - When the following identifier starts a multi-word phrase
 *   (checked against {@link PHRASE_START_WORDS})
 * - When the following token is not an identifier or parenthesized expression
 *
 * ## Priority
 * Default priority is 50 — below phrase fusion so phrases match first.
 *
 * @param priority - Rule priority (default 50)
 * @returns A {@link NormalizerRule} that inserts implicit multiply operators
 */
export function implicitMultiplyRule(
	priority: number = 50,
	canStart?: (word: string) => boolean
): NormalizerRule {
	const phraseGuard = canStart ?? ((word: string) => PHRASE_START_WORDS.has(word.toLowerCase()));

	return {
    name: "implicit:multiply",
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      // ── Need at least one token after the current position ──
      if (pos + 1 >= tokens.length) return null;

      const t = tokens[pos];
      const next = tokens[pos + 1];

      // ── Guard: suppress if the next identifier starts a phrase ──
      // Uses the trie's canStart when available, falls back to hardcoded set.
      // This prevents "2 power of 3" from becoming "2 * power of 3".
      const nextValue = next.value.toLowerCase();
      if (phraseGuard(nextValue)) return null;

      // ── Check trigger conditions ──
      const triggers =
        (t.type === "NUMBER" || t.type === "RPAREN") &&
        (next.type === "IDENT" || next.type === "LPAREN" || next.type === "PI" || next.type === "E");

      if (!triggers) return null;

      // ── Insert a STAR token at the next token's position ──
      const starToken = new LexerToken(
        "STAR", tokenTypeId("STAR"), "*", "*",
        next.offset, 0, next.line, next.col,
      );

      // consumed = 1: only the current token is replaced with [current, STAR]
      // The next token is NOT consumed — it stays for the next iteration
      return { consumed: 1, replacement: [t, starToken] };
    },
  };
}

//#endregion
//#region ─── isInsideRangeContext — Bracket/Call-Paren Context Guard ───────────

/**
 * Whether token `pos` sits inside a context where a bare `NUMBER:NUMBER`
 * sequence means a Range, not a clock-time/laptime/video-timecode literal:
 * a matrix literal/index/slice (`[1,2,3]`, `a[0:3]`), OR a `map`/`reduce`/
 * `sum`/`prod` call's own argument-list parens (`map(f, 0:3)` — these
 * accept a bare Range argument directly, per the Calca spec's own
 * example). Scans backward from `pos` over the CURRENT pass's token array,
 * tracking `[`/`(` nesting depth — the same "positional guard via
 * backward scan" idiom already used elsewhere in this normalizer layer
 * (e.g. `LineRefNormalizerRule`'s previous-token check), generalized to
 * depth-tracking. An `LBRACKET` is unconditionally a range-safe opener; an
 * `LPAREN` is range-safe ONLY when immediately preceded by MAP/REDUCE/
 * SUM_FN/PROD_FN — an ordinary grouping/function-call paren is NOT, so
 * `(9:00) + 5` still means a clock time, not a range.
 *
 * Needed because the clock-time/laptime/video-timecode rules each match a
 * bare `NUMBER COLON NUMBER...` shape with ZERO context-awareness — a real
 * collision discovered when adding Range support, since e.g. "0:3" is
 * valid input to BOTH features. These contexts have no legitimate use for
 * a clock-time/laptime/timecode literal, so the carve-out costs the time
 * features nothing.
 *
 * IMPORTANT cross-pass-timing gotcha (a real bug found and fixed here,
 * not a hypothetical): the `LPAREN`-opener check deliberately tests the
 * RAW word text (`prev.value.toLowerCase()`), not `prev.type ===
 * "MAP"/"REDUCE"/...`. The normalizer's multi-pass loop hands every rule
 * the SAME frozen `tokens` snapshot for an entire pass — a rule scanning
 * a LATER position in that pass cannot see a fusion `mapReduceCallNormalizerRule`
 * performs at an EARLIER position in that SAME pass (fusion results only
 * become visible to other rules starting the NEXT pass). Checking the
 * fused token type here would miss exactly the case that matters most —
 * `map(f, 0:3)` on its very first normalization pass — silently letting
 * `0:3` fuse into a clock time before `map(`'s own fusion ever lands.
 * Testing the raw word is immune to this: it's true from the very first
 * pass, regardless of whether `mapReduceCallNormalizerRule` has run yet.
 * (`LBRACKET` above has no equivalent issue — it's a genuine lexer token
 * from the start, never itself the product of a fusion.)
 */
export function isInsideRangeContext(tokens: Token[], pos: number): boolean {
  const safeStack: boolean[] = [];
  for (let i = 0; i < pos; i++) {
    const t = tokens[i];
    if (t.type === "LBRACKET") {
      safeStack.push(true);
    } else if (t.type === "LPAREN") {
      const prev = tokens[i - 1];
      const opensMapReduceCall = !!prev && (
        prev.type === "MAP" || prev.type === "REDUCE" || prev.type === "SUM_FN" || prev.type === "PROD_FN" ||
        (prev.type === "IDENT" && (prev.value.toLowerCase() === "map" || prev.value.toLowerCase() === "reduce" || prev.value.toLowerCase() === "sum" || prev.value.toLowerCase() === "prod"))
      );
      safeStack.push(opensMapReduceCall);
    } else if (t.type === "RBRACKET" || t.type === "RPAREN") {
      safeStack.pop();
    }
  }
  return safeStack.length > 0 && safeStack[safeStack.length - 1];
}

//#endregion
//#region ─── createBuiltinNormalizerRules — All Built-in Rules ─────────────────

/**
 * Creates built-in non-phrase normalization rules.
 *
 * Returns implicit multiply insertion (priority 50).
 *
 * **Prefer** calling {@link implicitMultiplyRule} directly with a
 * `canStart` predicate wired to the normalizer's phrase trie:
 * ```ts
 * normalizer.register(implicitMultiplyRule(50, (w) => normalizer.canStartPhrase(w)));
 * ```
 * Without the predicate, this function falls back to a hardcoded
 * {@link PHRASE_START_WORDS} set that won't reflect package-registered phrases.
 *
 * @returns An array of {@link NormalizerRule} instances ready for registration
 */
export function createBuiltinNormalizerRules(): NormalizerRule[] {
  return [
    // ── Implicit operator insertion (priority 50) ──
    implicitMultiplyRule(),
  ];
}

/**
 * Built-in phrase → tokenType mappings.
 *
 * These are registered into the engine's {@link PhraseTrie} during
 * construction. Tests that create a standalone {@link TokenNormalizer}
 * should register these via {@link TokenNormalizer.addPhrase}.
 */
export const BUILTIN_PHRASES: Record<string, string> = {
	"to the power of": "CARET",
	"power of": "CARET",
	"increase by": "INCREASE_BY",
	"decrease by": "DECREASE_BY",
	"times by": "TIMES_BY",
	"multiply by": "MULTIPLY_BY",
	"divide by": "DIVIDE_BY",
};

//#endregion
