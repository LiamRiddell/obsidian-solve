/**
 * NormalizerRule — pluggable token normalization rule for the
 * TokenNormalizer post-lexer pass.
 *
 * Rules are applied in priority order (highest first).
 * Each rule tries to match at the current token position and
 * returns the number of tokens consumed and a replacement token array.
 *
 * This is a duplicate-free copy of the interface defined in
 * TokenNormalizer.ts to avoid circular imports.
 */

import type { Token } from "@solve-js/lexer/Token";

/**
 * Result of a successful rule match.
 */
export interface NormalizerMatch {
  /** Number of tokens consumed (≥ 1) */
  consumed: number;
  /** Replacement tokens to insert (may be empty, single, or multiple) */
  replacement: Token[];
}

/**
 * A normalization rule registered with the TokenNormalizer.
 *
 * @example
 * ```ts
 * const phraseRule: NormalizerRule = {
 *   name: 'phrase:to the power of',
 *   priority: 100,
 *   match: (tokens, pos) => {
 *     if (pos + 4 > tokens.length) return null;
 *     const phrase = tokens.slice(pos, pos + 5).map(t => t.value.toLowerCase()).join(' ');
 *     if (phrase === 'to the power of') {
 *       return { consumed: 5, replacement: [createToken('CARET', 'to the power of')] };
 *     }
 *     return null;
 *   },
 * };
 * ```
 */
export interface NormalizerRule {
  /** Debug name for this rule. */
  readonly name: string;
  /** Higher priority rules try to match first. */
  readonly priority: number;
  /** Try to match starting at position `pos` in the token stream.
   *  Returns the match result if successful, null otherwise. */
  match(tokens: Token[], pos: number): NormalizerMatch | null;
}

/**
 * Record of a token fusion performed by the normalizer.
 */
export interface TokenFusion {
  /** The rule that triggered this fusion. */
  rule: string;
  /** Original tokens before fusion. */
  sourceTokens: Token[];
  /** Resulting fused token. */
  fusedToken: Token;
}
