import { ExpressionLexer, LineClassification, LexerVocabulary, type ScanLineResult } from "./ExpressionLexer";
import { Token } from "@solve-js/lexer/Token";
import { LexerState } from "@solve-js/lexer/LexerState";
import { getTokenCategory } from "@solve-js/language/TokenCategoryMap";
import type { TokenCategory } from "@solve-js/language/TokenCategory";
import type { TokenLookup } from "@solve-js/lexer/TokenClassRegistry";

/**
 * Public tokenizer wrapper around {@link ExpressionLexer}.
 *
 * `ExpressionLexer` does the actual character-by-character scanning;
 * `Lexer` adds a materialized-token-array streaming interface
 * (`next()`/`peek()`) plus line-classification state (`reset()`) so
 * callers can iterate a line's tokens without re-scanning on each peek.
 *
 * Each `ExpressionEngine` instance owns its own `Lexer`, and packages
 * extend it via {@link registerVocabulary} (keywords, operators, units) —
 * see `IEnginePackage.lexerVocabulary`.
 */
export class Lexer {
  /** Expression-mode lexer (Phase A: V8-optimized, replaces moo) */
  private expressionLexer: ExpressionLexer;
  private currentState: LexerState = LexerState.Main;
  private peekedToken: Token | undefined;
  private hasPeeked = false;

  // Materialized token array from the last reset() call, used for
  // next()/peek() streaming access.
  private tokens: Token[] = [];
  private tokenIdx: number = 0;

  /**
   * @param localeCode - Locale code (e.g., "en", "de"). Defaults to "en".
   * @param tokenLookup - Optional TokenLookup from TokenClassRegistry.
   *   When provided, configures ExpressionLexer to use registry-built
   *   keyword/unit/phrase lookups instead of internal instance maps.
   */
  constructor(localeCode = "en", tokenLookup?: TokenLookup) {
    // Pass the lookup directly to ExpressionLexer's constructor — it's an
    // instance field now, not a static. Each Lexer instance gets its own
    // isolated lookup, preventing cross-instance corruption.
    this.expressionLexer = new ExpressionLexer(localeCode, tokenLookup);
  }

  reset(input: string, state?: LexerState): void {
    const newState = state ?? LexerState.Main;
    this.currentState = newState;
    this.hasPeeked = false;
    this.peekedToken = undefined;

    // Phase B: Main state classifies the line with the markdown scanner.
    // Skip lines (headings, fences, HRs, etc.) produce empty token arrays.
    // Expression lines and lines with inline solves are tokenized normally.
    if (newState === LexerState.Main) {
      const classification = this.expressionLexer.classifyLine(input);
      if (classification.skip) {
        this.tokens = [];
        this.tokenIdx = 0;
        return;
      }
      // Expression line or markdown line with inline solves — tokenize.
      this.expressionLexer.reset(input);
      this.tokens = this.expressionLexer.tokenizeAll();
      this.tokenIdx = 0;
    } else {
      // Non-main states (Inline, String) — expression tokenization.
      this.expressionLexer.reset(input);
      this.tokens = this.expressionLexer.tokenizeAll();
      this.tokenIdx = 0;
    }
  }

  /**
   * Classify a single line of markdown text (Phase B).
   * Delegates to the ExpressionLexer's character-by-character scanner.
   */
  classifyLine(lineText: string): LineClassification {
    return this.expressionLexer.classifyLine(lineText);
  }

  /**
   * Find all inline solve markers in a line (Phase B).
   * Delegates to the ExpressionLexer's character-by-character scanner.
   */
  findInlineSolves(lineText: string) {
    return this.expressionLexer.findInlineSolves(lineText);
  }

  /**
   * Every keyword this lexer currently recognizes (locale + plugin-contributed),
   * mapped to the token type it lexes to. Delegates to the ExpressionLexer.
   */
  getKeywords(): Record<string, string> {
    return this.expressionLexer.getKeywords();
  }

  next(): Token | undefined {
    if (this.hasPeeked) {
      this.hasPeeked = false;
      return this.peekedToken;
    }
    // Materialized token array (ExpressionLexer path).
    if (this.tokenIdx < this.tokens.length) {
      return this.tokens[this.tokenIdx++];
    }
    return undefined;
  }

  peek(): Token | undefined {
    if (this.hasPeeked) return this.peekedToken;
    this.peekedToken = this.next();
    this.hasPeeked = true;
    return this.peekedToken;
  }

  [Symbol.iterator](): Iterator<Token> {
    return this.tokens[Symbol.iterator]();
  }

  /**
   * Register a plugin to extend the lexer with custom tokens.
   * Delegates to the underlying ExpressionLexer.
   *
   * @see LexerVocabulary for the supported extension points.
   */
  registerVocabulary(plugin: LexerVocabulary): void {
    this.expressionLexer.registerVocabulary(plugin);
  }

  /**
   * Unregister a plugin, removing its custom tokens from the lexer.
   * Delegates to the underlying ExpressionLexer.
   */
  unregisterVocabulary(plugin: LexerVocabulary): void {
    this.expressionLexer.unregisterVocabulary(plugin);
  }

  /**
   * Reset the lexer for expression-only text — skips the classifyLine()
   * overhead in reset() for callers that already know the input is an
   * evaluable expression (e.g., after isEmptyLine() confirmed non-skip).
   */
  resetExpression(input: string): void {
    this.currentState = LexerState.Main;
    this.hasPeeked = false;
    this.peekedToken = undefined;
    this.expressionLexer.reset(input);
    this.tokens = this.expressionLexer.tokenizeAll();
    this.tokenIdx = 0;
  }

  /**
   * Scan a full document in one pass, classifying each line and
   * tokenizing non-skipped lines. Delegates to ExpressionLexer.
   *
   * @returns ScanLineResult[] — one per line, with classification + tokens.
   */
  scanDocument(text: string): ScanLineResult[] {
    return this.expressionLexer.scanDocument(text);
  }

  getState(): LexerState {
    return this.currentState;
  }

  setState(state: LexerState): void {
    this.currentState = state;
  }

  getHighlightTokens(lineText: string): {type: string; value: string; offset: number; col: number; length: number; category: TokenCategory | undefined}[] {
    const classification = this.expressionLexer.classifyLine(lineText);

    // For blockquote lines, strip the "> " prefix and tokenize the expression content.
    // This lets expressions inside blockquotes (e.g., "> 1 + 2") get syntax highlighted
    // while pure structural lines (headings, code fences) remain unhighlighted.
    if (classification.skip && lineText.startsWith("> ")) {
      return this.collectHighlightTokens(lineText.slice(2));
    }

    if (classification.skip) {
      return [];
    }

    return this.collectHighlightTokens(lineText);
  }

  private collectHighlightTokens(lineText: string): {type: string; value: string; offset: number; col: number; length: number; category: TokenCategory | undefined}[] {
    this.resetExpression(lineText);
    const result: {type: string; value: string; offset: number; col: number; length: number; category: TokenCategory | undefined}[] = [];
    for (const token of this) {
      if (token.type === "WS" || token.type === "NEWLINE") continue;
      if (token.type.startsWith("MD_")) continue;
      if (token.type === "INLINE_SOLVE_START" || token.type === "BACKTICK_CLOSE") continue;
      result.push({
        type: token.type,
        value: token.value,
        offset: token.offset,
        col: token.col,
        length: token.value.length,
        category: getTokenCategory(token.type),
      });
    }
    return result;
  }
}

export const sharedLexer = new Lexer("en", undefined);