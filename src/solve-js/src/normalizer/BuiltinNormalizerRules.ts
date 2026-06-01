//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * Built-in normalization rules for the {@link TokenNormalizer}.
 *
 * These rules handle common expression patterns that span multiple tokens:
 * phrase fusion (e.g., "to the power of" → CARET) and implicit operator
 * insertion (e.g., "2 x" → "2 * x").
 *
 * ## Factory functions
 * - {@link phraseFusionRule}: Creates a rule that fuses consecutive words into a compound token
 * - {@link implicitMultiplyRule}: Creates a rule that inserts STAR between implicit multiplicands
 * - {@link createBuiltinNormalizerRules}: Returns all built-in rules in correct priority order
 *
 * ## Priority ordering
 * Longer phrases (100) match before shorter ones (80), which match before
 * implicit operators (50). This ensures "2 to the power of 3" becomes
 * `2 ^ 3` rather than `2 * to the power of 3`.
 *
 * @module BuiltinNormalizerRules
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "./NormalizerRule";
import { createFusedToken } from "./TokenNormalizer";

//#endregion
//#region ─── phraseFusionRule — Multi-word Phrase Fusion ───────────────────────

/**
 * Creates a normalization rule that fuses a multi-word phrase into a single
 * compound token.
 *
 * ## How it works
 * The rule matches `wordCount` consecutive tokens whose values (case-insensitive)
 * exactly match the phrase words. Matched tokens are replaced with a single
 * fused token of the specified type.
 *
 * ## Why match by value, not type
 * The lexer resolves keywords like "times" → STAR and "by" → OF, so the
 * token types can vary. Matching by token value (case-insensitive) is
 * more robust and works regardless of the locale's keyword mapping.
 *
 * ## Priority
 * Default priority is 100 (highest tier). Longer phrases should use
 * higher priority than shorter overlapping ones.
 *
 * @param phrase    - The multi-word phrase (e.g., "to the power of")
 * @param tokenType - The resulting token type (e.g., "CARET", "TIMES_BY")
 * @param priority  - Rule priority (default 100 for phrase fusion)
 * @returns A {@link NormalizerRule} that performs the fusion
 *
 * @example
 * ```ts
 * // "to the power of" becomes a single CARET token (priority 100)
 * const powerRule = phraseFusionRule("to the power of", "CARET");
 *
 * // "times by" becomes TIMES_BY (priority 80)
 * const timesByRule = phraseFusionRule("times by", "TIMES_BY", 80);
 * ```
 */
export function phraseFusionRule(
  phrase: string,
  tokenType: string,
  priority: number = 100
): NormalizerRule {
  const words = phrase.split(" ");
  const wordCount = words.length;
  const lowerWords = words.map(w => w.toLowerCase());

  return {
    name: `phrase:${phrase}`,
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      // ── Bounds check: not enough tokens remaining for this phrase ──
      if (pos + wordCount > tokens.length) return null;

      // ── Match each word consecutively by value (case-insensitive) ──
      let tokenIdx = pos;
      for (let wordIdx = 0; wordIdx < wordCount; wordIdx++) {
        const t = tokens[tokenIdx];
        if (t.value.toLowerCase() !== lowerWords[wordIdx]) return null;
        tokenIdx++;
      }

      // ── All words matched — fuse into a single compound token ──
      const matchedTokens = tokens.slice(pos, pos + wordCount);
      const fused = createFusedToken(tokenType, phrase, matchedTokens);
      return { consumed: wordCount, replacement: [fused] };
    },
  };
}

//#endregion
//#region ─── PHRASE_START_WORDS — Implicit Multiply Guard ─────────────────────

/**
 * Words that can start multi-word phrases.
 *
 * When the implicit multiply rule encounters a NUMBER followed by an IDENT,
 * it checks whether the IDENT starts a phrase. If it does, implicit multiply
 * is suppressed so the phrase fusion rule can match the complete phrase
 * on the next pass.
 *
 * ## Examples
 * - `"2 power of 3"` → CARET fusion, NOT `"2 * power of 3"`
 * - `"increase 100 by 20%"` → INCREASE_BY fusion, NOT `"increase 100 * by 20%"`
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
export function implicitMultiplyRule(priority: number = 50): NormalizerRule {
  return {
    name: "implicit:multiply",
    priority,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      // ── Need at least one token after the current position ──
      if (pos + 1 >= tokens.length) return null;

      const t = tokens[pos];
      const next = tokens[pos + 1];

      // ── Guard: suppress if the next identifier starts a phrase ──
      // This prevents "2 power of 3" from becoming "2 * power of 3"
      const nextValue = next.value.toLowerCase();
      if (PHRASE_START_WORDS.has(nextValue)) return null;

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
 * Creates the complete set of built-in normalization rules in priority order.
 *
 * ## Rule set (in descending priority)
 * 1. `"to the power of"` → CARET (priority 100)
 * 2. `"power of"` → CARET (priority 100)
 * 3. `"increase by"` → INCREASE_BY (priority 100)
 * 4. `"decrease by"` → DECREASE_BY (priority 100)
 * 5. `"times by"` → TIMES_BY (priority 100)
 * 6. `"multiply by"` → MULTIPLY_BY (priority 100)
 * 7. `"divide by"` → DIVIDE_BY (priority 100)
 * 8. Implicit multiply insertion (priority 50)
 *
 * @returns An array of {@link NormalizerRule} instances ready for registration
 */
export function createBuiltinNormalizerRules(): NormalizerRule[] {
  return [
    // ── Phrase fusion rules (priority 100) ──
    phraseFusionRule("to the power of", "CARET"),
    phraseFusionRule("power of", "CARET"),
    phraseFusionRule("increase by", "INCREASE_BY"),
    phraseFusionRule("decrease by", "DECREASE_BY"),
    phraseFusionRule("times by", "TIMES_BY"),
    phraseFusionRule("multiply by", "MULTIPLY_BY"),
    phraseFusionRule("divide by", "DIVIDE_BY"),

    // ── Implicit operator insertion (priority 50) ──
    implicitMultiplyRule(),
  ];
}

//#endregion
