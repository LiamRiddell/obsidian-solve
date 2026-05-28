import { ExpressionLexer, LineClassification, LexerPlugin } from "./ExpressionLexer";
import { Token } from "@solve-js/lexer/Token";
import { LexerState } from "@solve-js/lexer/LexerState";
import { getTokenHighlightClass } from "@solve-js/lexer/TokenHighlightMap";

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

  constructor(localeCode = "en") {
    this.expressionLexer = new ExpressionLexer(localeCode);
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
      this.tokens = this.expressionLexer.tokenizeAll('expression');
      this.tokenIdx = 0;
    } else {
      // Non-main states (Inline, String) — expression tokenization.
      this.expressionLexer.reset(input);
      this.tokens = this.expressionLexer.tokenizeAll('expression');
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
   * @see LexerPlugin for the supported extension points.
   */
  registerPlugin(plugin: LexerPlugin): void {
    this.expressionLexer.registerPlugin(plugin);
  }

  /**
   * Unregister a plugin, removing its custom tokens from the lexer.
   * Delegates to the underlying ExpressionLexer.
   */
  unregisterPlugin(plugin: LexerPlugin): void {
    this.expressionLexer.unregisterPlugin(plugin);
  }

  getState(): LexerState {
    return this.currentState;
  }

  setState(state: LexerState): void {
    this.currentState = state;
  }

  getHighlightTokens(lineText: string): {type: string; value: string; offset: number; col: number; length: number; className: string | undefined}[] {
    this.reset(lineText);
    const result: {type: string; value: string; offset: number; col: number; length: number; className: string | undefined}[] = [];
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
        className: getTokenHighlightClass(token.type),
      });
    }
    return result;
  }
}

export const sharedLexer = new Lexer("en");