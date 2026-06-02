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
