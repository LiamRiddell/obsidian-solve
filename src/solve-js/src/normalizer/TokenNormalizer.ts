/**
 * TokenNormalizer — post-lexer token normalization pass.
 *
 * Applies domain-specific NormalizerRules to the raw token stream
 * produced by the ExpressionLexer. Rules can:
 *   - Fuse multi-word phrases into compound tokens (e.g., IDENT+...+IDENT → CARET)
 *   - Insert implicit operators (e.g., NUMBER IDENT → NUMBER STAR IDENT)
 *   - Apply domain-specific token transformations (e.g., item name fusion)
 *
 * The normalizer keeps the lexer slim — no phrase trie, no domain logic.
 * Providers register NormalizerRules alongside Parselets and OpCode handlers.
 *
 * @module TokenNormalizer
 */

import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch, TokenFusion } from "./NormalizerRule";

/**
 * Options for the normalization pass.
 */
export interface NormalizerOptions {
  /** Maximum number of rule applications before bailing out (safety limit). */
  maxPasses?: number;
  /** Maximum number of tokens after normalization (safety limit). */
  maxTokens?: number;
  /** Callback for each fusion event (for diagnostic collection). */
  onFusion?: (fusion: TokenFusion) => void;
}

const DEFAULT_OPTIONS: Required<NormalizerOptions> = {
  maxPasses: 100,
  maxTokens: 10000,
  onFusion: () => {},
};

/**
 * Creates a new normalized token from fused source tokens.
 * Uses the first token's position information and the combined text.
 */
export function createFusedToken(
  type: string,
  text: string,
  sourceTokens: Token[]
): Token {
  const first = sourceTokens[0];
  return new LexerToken(
    type,
    tokenTypeId(type),
    text,
    text,
    first.offset,
    first.lineBreaks ?? 0,
    first.line,
    first.col,
  );
}

/**
 * Token normalizer: applies NormalizerRules to a token stream.
 *
 * Usage:
 * ```ts
 * const normalizer = new TokenNormalizer();
 * normalizer.register(phraseRule);
 * normalizer.register(implicitMultRule);
 * const normalized = normalizer.normalize(rawTokens);
 * ```
 */
export class TokenNormalizer {
  private rules: NormalizerRule[] = [];
  private options: Required<NormalizerOptions>;

  constructor(options: NormalizerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a normalization rule.
   * Rules are sorted by priority (descending) on each normalize() call.
   */
  register(rule: NormalizerRule): void {
    this.rules.push(rule);
  }

  /**
   * Unregister a normalization rule by name.
   */
  unregister(ruleName: string): void {
    this.rules = this.rules.filter(r => r.name !== ruleName);
  }

  /**
   * Clear all registered rules.
   */
  clear(): void {
    this.rules = [];
  }

  /**
   * Get the number of registered rules.
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  /**
   * Normalize a token stream by applying all registered rules.
   *
   * Applies rules greedily left-to-right. At each position, tries rules
   * in priority order (highest first). When a rule matches, the matched
   * tokens are replaced and processing continues from the replacement.
   *
   * Multiple passes may be needed if one rule's output triggers another rule.
   * A safety limit (maxPasses) prevents infinite loops from recursive rules.
   *
   * @param tokens - Raw tokens from the lexer.
   * @param onFusion - Optional callback for fusion events (overrides options.onFusion).
   * @returns Normalized tokens.
   */
  normalize(tokens: Token[], onFusion?: (fusion: TokenFusion) => void): Token[] {
    if (tokens.length === 0) return tokens;
    if (this.rules.length === 0) return tokens;

    const sorted = [...this.rules].sort((a, b) => b.priority - a.priority);
    const fusionHandler = onFusion ?? this.options.onFusion
    const maxPasses = this.options.maxPasses;
    const maxTokens = this.options.maxTokens;

    let current = tokens;
    let changed = true;
    let passCount = 0;

    // Multi-pass: rules may trigger cascading matches
    while (changed && passCount < maxPasses) {
      changed = false;
      passCount++;

      const result: Token[] = [];
      let pos = 0;

      while (pos < current.length) {
        let matched = false;

        for (const rule of sorted) {
          const match = rule.match(current, pos);
          if (match) {
            // Collect source tokens for fusion tracking
            const sourceTokens = current.slice(pos, pos + match.consumed);

            // Insert replacement tokens
            for (const rt of match.replacement) {
              result.push(rt);
            }

            // Track fusion if tokens were merged
            if (match.consumed > 1 && match.replacement.length === 1) {
              fusionHandler({
                rule: rule.name,
                sourceTokens,
                fusedToken: match.replacement[0],
              });
            } else if (match.consumed > 1 && match.replacement.length < match.consumed) {
              // Multiple-to-single or multiple-to-fewer is also a fusion
              for (const rt of match.replacement) {
                fusionHandler({
                  rule: rule.name,
                  sourceTokens,
                  fusedToken: rt,
                });
              }
            }

            pos += match.consumed;
            changed = true;
            matched = true;
            break; // restart rule matching from this position
          }
        }

        if (!matched) {
          // No rule matched — pass through unchanged
          result.push(current[pos]);
          pos++;
        }
      }

      // Safety: bail if token count explodes
      if (result.length > maxTokens) {
        throw new Error(
          `TokenNormalizer: normalized token count (${result.length}) exceeds safety limit (${maxTokens})`
        );
      }

      current = result;
    }

    return current;
  }
}
