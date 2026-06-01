//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * TokenNormalizer — post-lexer token normalization pass.
 *
 * ## Purpose
 * Applies domain-specific {@link NormalizerRule | NormalizerRules} to the raw
 * token stream produced by the {@link ExpressionLexer}. This keeps the lexer
 * slim and focused on single-token production, while multi-token pattern
 * matching (phrases, implicit operators, domain merges) lives here.
 *
 * ## What rules can do
 * - **Phrase fusion**: Merge consecutive words into compound tokens
 *   (e.g., `IDENT + ... + IDENT` → `CARET`)
 * - **Implicit operator insertion**: Insert missing operators between tokens
 *   (e.g., `NUMBER IDENT` → `NUMBER STAR IDENT`)
 * - **Domain-specific transformations**: Coalesce item names, currency pairs,
 *   percentage syntax, etc.
 *
 * ## Architecture
 * Providers register NormalizerRules alongside Parselets and OpCode handlers
 * via {@link ISolvePackage.normalizerRules}. The normalizer applies them
 * greedily left-to-right in multiple passes with safety limits.
 *
 * @module TokenNormalizer
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch, TokenFusion } from "./NormalizerRule";

//#endregion
//#region ─── NormalizerOptions — Configuration ────────────────────────────────

/**
 * Configuration options for the normalization pass.
 *
 * These control safety limits and diagnostic callbacks. The defaults
 * are chosen to be generous enough for any realistic expression while
 * preventing runaway token expansion from recursive rules.
 */
export interface NormalizerOptions {
  /**
   * Maximum number of full passes over the token stream before bailing out.
   * Prevents infinite loops from recursive rule chains.
   * @default 100
   */
  maxPasses?: number;

  /**
   * Maximum number of tokens allowed after normalization.
   * If exceeded, an Error is thrown rather than passing a bloated stream
   * to the parser.
   * @default 10000
   */
  maxTokens?: number;

  /**
   * Callback invoked for each fusion event during normalization.
   * Used by diagnostic mode to populate {@link NormalizerOutput.fusions}.
   * When `undefined`, fusions are still tracked internally but no callbacks fire.
   */
  onFusion?: (fusion: TokenFusion) => void;
}

//#endregion
//#region ─── Default Options ──────────────────────────────────────────────────

/** Sensible defaults that catch infinite loops without limiting real expressions. */
const DEFAULT_OPTIONS: Required<NormalizerOptions> = {
  maxPasses: 100,
  maxTokens: 10000,
  onFusion: () => {},
};

//#endregion
//#region ─── createFusedToken — Token Factory ──────────────────────────────────

/**
 * Creates a new normalized token from fused source tokens.
 *
 * The fused token inherits position information (offset, line, column)
 * from the first source token, which preserves source-map accuracy
 * for error messages and diagnostic highlighting.
 *
 * @param type         - The new token type (e.g., "CARET", "TIMES_BY")
 * @param text         - The combined text representation (e.g., "to the power of")
 * @param sourceTokens - The original tokens being fused (at least 2)
 * @returns A new {@link LexerToken} with the fused type and combined text
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

//#endregion
//#region ─── TokenNormalizer Class ─────────────────────────────────────────────

/**
 * Token normalizer: applies {@link NormalizerRule | NormalizerRules} to a token stream.
 *
 * ## Lifecycle
 * 1. **Registration**: Rules are added via {@link register} and sorted by priority
 * 2. **Normalization**: {@link normalize} applies rules greedily left-to-right
 * 3. **Cleanup**: {@link clear} or {@link unregister} removes rules
 *
 * ## Normalization algorithm
 * The normalizer uses a greedy left-to-right multi-pass algorithm:
 * - At each token position, rules are tried in priority order (highest first)
 * - When a rule matches, matched tokens are consumed and replaced
 * - Processing continues from the replacement position
 * - Multiple passes handle cascading matches (one rule's output triggers another)
 * - Safety limits ({@link NormalizerOptions.maxPasses}) prevent infinite loops
 *
 * @example
 * ```ts
 * const normalizer = new TokenNormalizer();
 * normalizer.register(phraseRule);       // "to the power of" → CARET
 * normalizer.register(implicitMultRule); // "2 x" → "2 * x"
 * const normalized = normalizer.normalize(rawTokens);
 * ```
 */
export class TokenNormalizer {
  /** Registered rules, unsorted. Sorted on each normalize() call. */
  private rules: NormalizerRule[] = [];

  /** Merged options with defaults applied. */
  private options: Required<NormalizerOptions>;

  // ── Constructor ──────────────────────────────────────────────────────────

  /**
   * @param options - Configuration overrides for safety limits and diagnostic callbacks
   */
  constructor(options: NormalizerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ── Rule Management ──────────────────────────────────────────────────────

  /**
   * Register a normalization rule.
   *
   * Rules are sorted by priority (descending) on each {@link normalize} call.
   * Multiple rules can share the same priority — they are tried in registration
   * order when priorities are equal.
   *
   * @param rule - The rule to register
   */
  register(rule: NormalizerRule): void {
    this.rules.push(rule);
  }

  /**
   * Unregister a normalization rule by its {@link NormalizerRule.name | name}.
   *
   * If multiple rules share the same name, all are removed. This is safe to
   * call with a name that doesn't match any rule — it simply has no effect.
   *
   * @param ruleName - The name of the rule to remove
   */
  unregister(ruleName: string): void {
    this.rules = this.rules.filter(r => r.name !== ruleName);
  }

  /**
   * Remove all registered rules, resetting the normalizer to its initial state.
   */
  clear(): void {
    this.rules = [];
  }

  /**
   * Get the number of currently registered rules.
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  // ── Normalization ────────────────────────────────────────────────────────

  /**
   * Normalize a token stream by applying all registered rules.
   *
   * ## Algorithm
   * Applies rules greedily left-to-right in multiple passes:
   * 1. Sort rules by priority (descending)
   * 2. Walk the token stream left to right
   * 3. At each position, try rules in priority order
   * 4. On match: consume matched tokens, insert replacements, restart from insert point
   * 5. On no match: pass token through unchanged
   * 6. Repeat until a full pass produces no changes, or maxPasses is reached
   *
   * ## Fusion tracking
   * When a rule consumes more tokens than it produces, the normalizer calls
   * `onFusion` with a {@link TokenFusion} record for diagnostic collection.
   * This populates {@link NormalizerOutput.fusions} in the playground pipeline view.
   *
   * ## Safety
   * If the normalized token count exceeds {@link NormalizerOptions.maxTokens},
   * an Error is thrown to prevent memory exhaustion from runaway rule expansion.
   *
   * @param tokens   - Raw tokens from the lexer
   * @param onFusion - Optional fusion callback (overrides {@link NormalizerOptions.onFusion})
   * @returns Normalized tokens ready for parsing
   * @throws {Error} If the normalized token count exceeds maxTokens
   */
  normalize(tokens: Token[], onFusion?: (fusion: TokenFusion) => void): Token[] {
    // ── Early exits: nothing to normalize ──
    if (tokens.length === 0) return tokens;
    if (this.rules.length === 0) return tokens;

    // ── Sort rules once per normalize call ──
    const sorted = [...this.rules].sort((a, b) => b.priority - a.priority);
    const fusionHandler = onFusion ?? this.options.onFusion;
    const maxPasses = this.options.maxPasses;
    const maxTokens = this.options.maxTokens;

    let current = tokens;
    let changed = true;
    let passCount = 0;

    // Multi-pass loop: rules may trigger cascading matches across passes
    while (changed && passCount < maxPasses) {
      changed = false;
      passCount++;

      const result: Token[] = [];
      let pos = 0;

      // Single-pass left-to-right greedy walk
      while (pos < current.length) {
        let matched = false;

        // Try every rule in priority order at this position
        for (const rule of sorted) {
          const match = rule.match(current, pos);
          if (match) {
            // Collect source tokens for fusion tracking
            const sourceTokens = current.slice(pos, pos + match.consumed);

            // Insert replacement tokens into result
            for (const rt of match.replacement) {
              result.push(rt);
            }

            // Track fusion events for diagnostics:
            // - Multiple tokens → single token: classic fusion
            // - Multiple tokens → fewer tokens: partial fusion
            if (match.consumed > 1 && match.replacement.length === 1) {
              fusionHandler({
                rule: rule.name,
                sourceTokens,
                fusedToken: match.replacement[0],
              });
            } else if (match.consumed > 1 && match.replacement.length < match.consumed) {
              for (const rt of match.replacement) {
                fusionHandler({
                  rule: rule.name,
                  sourceTokens,
                  fusedToken: rt,
                });
              }
            }

            // Advance position past consumed tokens
            pos += match.consumed;
            changed = true;
            matched = true;
            break; // Rule matched — restart at new position with highest-priority rules
          }
        }

        if (!matched) {
          // No rule matched at this position — pass token through unchanged
          result.push(current[pos]);
          pos++;
        }
      }

      // Safety: bail if token count explodes (runaway rule expansion)
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

//#endregion
