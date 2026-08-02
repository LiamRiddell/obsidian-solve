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
 * via {@link IEnginePackage.normalizerRules}. The normalizer applies them
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
import { PhraseTrie } from "./PhraseTrie";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

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
//#region ─── NON_WORD_TOKEN_TYPES — Type-guard skip set ────────────────────────

/**
 * Token types that can NEVER start a multi-word phrase.
 *
 * Used by {@link normalize} to skip the PhraseTrie walk entirely at
 * positions where the token type makes phrase matching impossible.
 * This avoids even the O(1) {@link PhraseTrie.canStart} check.
 *
 * Types NOT in this set (IDENT, KEYWORD, FUNC, UNIT, and any custom
 * types registered by packages) still pass through to the trie for
 * a full match attempt.
 */
// ── Non-word type ID lookup table (flat Uint8Array — true O(1) array index) ──
//
// Index = token typeId, value = 1 if non-word (skip trie), 0 otherwise.
// Array indexing avoids ALL hashing: no Set.has(), no Map.get(), no string ops.
//
// Custom types from packages get IDs beyond the table length, so the bounds
// check `tid < TABLE.length` safely passes them through to the trie.
//
// Arithmetic operators (PLUS, MINUS, STAR, SLASH, CARET, MOD, PERCENT) are
// intentionally excluded: in keyword locales the lexer maps "times"→STAR,
// "divide"→SLASH etc., and those tokens CAN start phrases like "times by".
/**
 * Token type names that can NEVER start a multi-word phrase.
 *
 * Exported for testing only — consumers should use the type-guard behavior
 * of {@link TokenNormalizer.normalize} rather than this list directly.
 */
export const NON_WORD_NAMES = [
	"NUMBER", "HEX", "BIGINT", "FLOAT",
	"LSHIFT", "RSHIFT", "BIT_AND", "BIT_OR", "BIT_XOR",
	"LPAREN", "RPAREN", "LBRACKET", "RBRACKET",
	"COMMA", "COLON", "EQUALS", "THEREFORE", "PIPE", "AMPERSAND", "AT",
	"SEMICOLON", "QUESTION", "EXCLAMATION",
	"EOF", "WS", "NEWLINE",
] as const;

/**
 * Flat Uint8Array lookup table: index = token typeId, value = 1 if non-word.
 *
 * Exported for testing only — consumers should not depend on the internal
 * table layout, as the set of non-word types may change.
 */
export const NON_WORD_TABLE: Uint8Array = (() => {
	// Resolve all non-word type names to their numeric IDs
	const ids = NON_WORD_NAMES.map(n => tokenTypeId(n));
	// Size the table to cover the largest ID + 1
	const len = Math.max(...ids) + 1;
	const table = new Uint8Array(len);
	// Mark non-word type positions
	for (const id of ids) table[id] = 1;
	return table;
})();

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
  /** Registered rules, unsorted — the source of truth. */
  private rules: NormalizerRule[] = [];

  /**
   * Priority-sorted copy of {@link rules}, rebuilt lazily on the next
   * {@link normalize} call after a mutation. Rules are registered once at
   * engine/package-registration time and essentially never change during a
   * session, but normalize() runs on every keystroke-driven evaluation — an
   * earlier version re-sorted a fresh copy of `rules` on every single call,
   * which meant every keystroke paid for an allocation + sort of a list that
   * had usually not changed since the last one. `null` means "stale, rebuild
   * on next use"; {@link register}/{@link unregister}/{@link clear} all
   * invalidate it.
   */
  private sortedRulesCache: NormalizerRule[] | null = null;

  /**
   * Phrase trie for single-pass multi-word phrase fusion.
   * Tried at each token position BEFORE other rules — the trie walk
   * is O(depth) vs O(R × W) for separate rule matching.
   */
  private phraseTrie = new PhraseTrie();

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
    this.sortedRulesCache = null;
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
    this.sortedRulesCache = null;
  }

  /**
   * Remove all registered rules, resetting the normalizer to its initial state.
   * Also clears the phrase trie.
   */
  clear(): void {
    this.rules = [];
    this.sortedRulesCache = null;
    this.phraseTrie = new PhraseTrie();
  }

  /**
   * Priority-sorted view of {@link rules} (descending priority; registration
   * order preserved for ties, since {@link Array.prototype.sort} is stable).
   * Cached until the next mutation — see {@link sortedRulesCache}.
   */
  private getSortedRules(): NormalizerRule[] {
    if (this.sortedRulesCache === null) {
      this.sortedRulesCache = [...this.rules].sort((a, b) => b.priority - a.priority);
    }
    return this.sortedRulesCache;
  }

  /**
   * Get the number of currently registered rules (excludes phrase trie entries).
   */
  get ruleCount(): number {
    return this.rules.length;
  }

  // ── Phrase Registration ────────────────────────────────────────────────

  /**
   * Register a multi-word phrase for fusion into a single compound token.
   *
   * This is the preferred way to add phrase patterns. It inserts into the
   * internal {@link PhraseTrie}, which collapses all phrase rules into a
   * single O(depth) trie walk per position — no separate rule scanning.
   *
   * @param phrase    - Multi-word phrase (e.g., "to the power of", "abyssal whip")
   * @param tokenType - Target token type after fusion (e.g., "CARET", "ITEM")
   */
  addPhrase(phrase: string, tokenType: string): void {
    this.phraseTrie.addPhrase(phrase, tokenType);
  }

  /**
   * Check whether a word can start any registered phrase.
   *
   * Used by {@link implicitMultiplyRule} to suppress `*` insertion
   * before phrase-starting identifiers (e.g., "2 power of 3" → `2 ^ 3`,
   * not `2 * power of 3`). Delegates to {@link PhraseTrie.canStart}.
   */
  /**
   * Get all registered phrases and their target token types.
   *
   * Exposes the full phrase trie structure for diagnostic rendering
   * in the playground's NormalizerTab. Returns ALL registered phrases,
   * not just the ones that matched in the last evaluation.
   */
  getPhrases(): Record<string, string> {
    return this.phraseTrie.getAllPhrases();
  }

  canStartPhrase(word: string): boolean {
    return this.phraseTrie.canStart(word);
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
    // ── Early exit: nothing to normalize ──
    if (tokens.length === 0) return tokens;

    // ── Priority-sorted rules — cached across calls, see getSortedRules() ──
    const sorted = this.getSortedRules();
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

        // ── Fast path: phrase trie (O(depth) single walk vs O(R × W) per rule) ──
        // O(1) type-guard: skip trie entirely for tokens that can't start phrases.
        // Flat Uint8Array indexed by typeId — no hashing, no Set lookup, true O(1).
        const tid = current[pos].typeId;
        if (tid >= NON_WORD_TABLE.length || NON_WORD_TABLE[tid] === 0) {
          const trieMatch = this.phraseTrie.matchAt(current, pos);
          if (trieMatch) {
            const sourceTokens = current.slice(pos, pos + trieMatch.consumed);
            for (const rt of trieMatch.replacement) {
              result.push(rt);
            }
            if (trieMatch.consumed > 1 && trieMatch.replacement.length === 1) {
              fusionHandler({
                rule: trieMatch.ruleName ?? "phrase-trie",
                sourceTokens,
                fusedToken: trieMatch.replacement[0],
              });
            }
            pos += trieMatch.consumed;
            changed = true;
            continue; // trie matched — skip other rules at this position (no need to set matched)
          }
        }

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
        // A raw Error here would bypass ThreeTierEvaluator's DAG-preservation
        // enrichment on compile failure (it specifically checks for
        // EngineError) — same reasoning as ExpressionEngineSafety.ts's
        // complexity/length checks, which this mirrors.
        throw ErrorFactory.validation(
          "NORMALIZED_TOKEN_LIMIT_EXCEEDED",
          `Normalized token count (${result.length}) exceeds safety limit (${maxTokens})`,
          { tokenCount: result.length, maxTokens }
        );
      }

      current = result;
    }

    return current;
  }
}

//#endregion
