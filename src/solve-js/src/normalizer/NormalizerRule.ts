//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * NormalizerRule — pluggable token normalization rule for the
 * TokenNormalizer post-lexer pass.
 *
 * ## Purpose
 * After the ExpressionLexer produces raw tokens (numbers, identifiers,
 * operators, etc.), the TokenNormalizer applies domain-specific rules
 * to transform the token stream before parsing. This keeps the lexer
 * focused on single-token production and moves multi-token pattern
 * matching into a dedicated normalization layer.
 *
 * ## How rules work
 * Rules are applied in priority order (highest first). At each token
 * position, the normalizer tries every rule in priority order until one
 * matches. Matched tokens are consumed and replaced; unmatched tokens
 * pass through unchanged.
 *
 * ## What rules can do
 * - **Phrase fusion**: Merge consecutive words into compound tokens
 *   (e.g., `"to" "the" "power" "of"` → `CARET`)
 * - **Implicit operators**: Insert missing operators between tokens
 *   (e.g., `NUMBER IDENT` → `NUMBER STAR IDENT`)
 * - **Domain transformations**: Coalesce item names, currency pairs, etc.
 *
 * ## Why a separate file?
 * This is a duplicate-free copy of the interface defined in
 * TokenNormalizer.ts. Storing it in a separate file avoids circular
 * imports — TokenNormalizer imports NormalizerRule, and rule factories
 * import TokenNormalizer's `createFusedToken`.
 *
 * @module NormalizerRule
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";

//#endregion
//#region ─── NormalizerMatch — Rule Match Result ──────────────────────────────

/**
 * Result of a successful rule match attempt against the token stream.
 *
 * When a {@link NormalizerRule.match} function finds a pattern at the
 * current position, it returns a NormalizerMatch describing how many
 * tokens to consume and what to replace them with.
 *
 * @example
 * ```ts
 * // The phrase "to the power of" (5 tokens) becomes a single CARET token
 * const match: NormalizerMatch = {
 *   consumed: 5,
 *   replacement: [caretToken],
 * };
 * ```
 */
export interface NormalizerMatch {
  /**
   * Number of tokens consumed from the stream at the match position.
   * Must be ≥ 1 — a match always advances the cursor.
   */
  consumed: number;

  /**
   * Replacement tokens to insert at the match position.
   * May be empty (deletion), a single token (fusion), or multiple
   * tokens (expansion/splitting).
   */
  replacement: Token[];

  /**
   * Human-readable rule name for diagnostic fusion tracking.
   * When set, the normalizer uses this instead of the rule's `name`
   * in {@link TokenFusion} records. Used by {@link PhraseTrie} to
   * report which specific phrase matched (e.g., "phrase:to the power of").
   */
  ruleName?: string;
}

//#endregion
//#region ─── NormalizerRule — Pluggable Rule Interface ────────────────────────

/**
 * A pluggable normalization rule registered with the TokenNormalizer.
 *
 * Each rule has a {@link name}, {@link priority}, and {@link match} function.
 * The match function receives the current token stream and a position,
 * and returns a {@link NormalizerMatch} on success or `null` on failure.
 *
 * ## Priority ordering
 * Higher priority rules are tried first at each position. This allows
 * long phrases (priority 100, e.g. "to the power of") to match before
 * shorter fragments (priority 80, e.g. "power of").
 *
 * ## Match contract
 * - Must be pure (no side effects, no mutation of input tokens)
 * - Must return `null` for any position that doesn't match
 * - Consumed tokens must be consecutive starting at `pos`
 * - Replacement tokens must be valid for downstream parsing
 *
 * @example
 * ```ts
 * // A phrase fusion rule that converts "to the power of" into CARET
 * const phraseRule: NormalizerRule = {
 *   name: 'phrase:to the power of',
 *   priority: 100,
 *   match: (tokens, pos) => {
 *     if (pos + 4 > tokens.length) return null;
 *     const phrase = tokens.slice(pos, pos + 5)
 *       .map(t => t.value.toLowerCase()).join(' ');
 *     if (phrase === 'to the power of') {
 *       return {
 *         consumed: 5,
 *         replacement: [createFusedToken('CARET', 'to the power of', tokens.slice(pos, pos + 5))],
 *       };
 *     }
 *     return null;
 *   },
 * };
 * ```
 */
export interface NormalizerRule {
  /**
   * Human-readable name for debugging and diagnostic display.
   * Convention: `"category:description"`, e.g. `"phrase:to the power of"`.
   */
  readonly name: string;

  /**
   * Priority for ordering rules. Higher values are tried first.
   * Recommended ranges:
   * - 100: Long multi-word phrase fusion (e.g., "to the power of")
   * - 80:  Short phrase fusion (e.g., "power of", "times by")
   * - 50:  Implicit operator insertion (e.g., implicit multiply)
   * - 20:  Domain-specific transformations
   */
  readonly priority: number;

  /**
   * Attempt to match a pattern starting at position `pos` in the token stream.
   *
   * @param tokens - The current token stream (may be partially normalized from prior passes)
   * @param pos    - The current position to attempt matching from
   * @returns A {@link NormalizerMatch} if the pattern is found, or `null` if no match
   */
  match(tokens: Token[], pos: number): NormalizerMatch | null;
}

//#endregion
//#region ─── TokenFusion — Fusion Event Record ────────────────────────────────

/**
 * Record of a token fusion event performed by the normalizer.
 *
 * When a rule merges multiple source tokens into fewer replacement tokens,
 * the normalizer fires a {@link NormalizerOptions.onFusion | fusion callback}
 * with this record. The playground uses these records to render the
 * fusion detail table showing exactly which tokens were merged and by
 * which rule.
 *
 * @example
 * ```ts
 * // "to" "the" "power" "of" fused into CARET "^"
 * const fusion: TokenFusion = {
 *   rule: "phrase:to the power of",
 *   sourceTokens: [toToken, theToken, powerToken, ofToken],
 *   fusedToken: caretToken,
 * };
 * ```
 */
export interface TokenFusion {
  /** The name of the rule that triggered this fusion (e.g., "phrase:to the power of") */
  rule: string;

  /** The original tokens before fusion — always ≥ 2 tokens */
  sourceTokens: Token[];

  /** The resulting fused token with its new type and combined value */
  fusedToken: Token;
}

//#endregion
