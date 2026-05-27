import { ExpressionLexer } from "./ExpressionLexer";
import { MarkdownLexer } from "./MarkdownLexer";
import { Token } from "@solve-js/lexer/Token";
import { LexerState } from "@solve-js/lexer/LexerState";
import { getTokenHighlightClass } from "@solve-js/lexer/TokenHighlightMap";

export class Lexer {
  /** Expression-mode lexer (Phase A: V8-optimized, replaces moo) */
  private expressionLexer: ExpressionLexer;
  /** Markdown-mode lexer (moo-based, kept for Phase B integration) */
  private markdownLexer: MarkdownLexer;
  private currentState: LexerState = LexerState.Main;
  private peekedToken: Token | undefined;
  private hasPeeked = false;

  // Materialized token array from the last reset() call, used for
  // next()/peek() streaming access.
  private tokens: Token[] = [];
  private tokenIdx: number = 0;

  constructor(localeCode = "en") {
    this.expressionLexer = new ExpressionLexer(localeCode);
    this.markdownLexer = new MarkdownLexer(localeCode, "main");
  }

  reset(input: string, state?: LexerState): void {
    const newState = state ?? LexerState.Main;
    this.currentState = newState;
    this.hasPeeked = false;
    this.peekedToken = undefined;

    // Phase A: Expression mode uses the new V8-optimized lexer.
    // Markdown mode (Main state) still uses moo-based MarkdownLexer.
    if (newState === LexerState.Main) {
      // Main state — could be markdown or expression; detect via input content.
      // For now, treat all main-state resets as expression mode (Phase A scope).
      // Phase B will add markdown-mode heuristics.
      this.expressionLexer.reset(input);
      this.tokens = this.expressionLexer.tokenizeAll('expression');
      this.tokenIdx = 0;
    } else {
      // Non-main states (Inline, String) — delegate to MarkdownLexer for now.
      this.markdownLexer.reset(input);
      this.tokens = [];
      this.tokenIdx = 0;
    }
  }

  next(): Token | undefined {
    if (this.hasPeeked) {
      this.hasPeeked = false;
      return this.peekedToken;
    }
    // If we have materialized tokens (ExpressionLexer path), use them.
    if (this.tokens.length > 0) {
      if (this.tokenIdx < this.tokens.length) {
        return this.tokens[this.tokenIdx++];
      }
      return undefined;
    }
    // Fallback: delegate to MarkdownLexer
    const t = this.markdownLexer.next();
    if (t !== undefined) {
      // Collect into tokens array for iterator support
      this.tokens.push(t);
    }
    return t;
  }

  peek(): Token | undefined {
    if (this.hasPeeked) return this.peekedToken;
    this.peekedToken = this.next();
    this.hasPeeked = true;
    return this.peekedToken;
  }

  [Symbol.iterator](): Iterator<Token> {
    // If tokens are materialized (ExpressionLexer path), return array iterator.
    if (this.tokens.length > 0) {
      return this.tokens[Symbol.iterator]();
    }
    // Fallback: delegate to MarkdownLexer
    return this.markdownLexer[Symbol.iterator]();
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