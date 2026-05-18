import { MarkdownLexer } from "./MarkdownLexer";
import { Token } from "@solve-js/lexer/Token";
import { LexerState } from "@solve-js/lexer/LexerState";
import { getTokenHighlightClass } from "@solve-js/lexer/TokenHighlightMap";

export class Lexer {
  private markdownLexer: MarkdownLexer;
  private currentState: LexerState = LexerState.Main;
  private peekedToken: Token | undefined;
  private hasPeeked = false;

  constructor(localeCode = "en") {
    this.markdownLexer = new MarkdownLexer(localeCode, "main");
  }

  reset(input: string, state?: LexerState): void {
    const newState = state ?? LexerState.Main;
    this.currentState = newState;
    this.markdownLexer.reset(input, newState);
    this.hasPeeked = false;
    this.peekedToken = undefined;
  }

  next(): Token | undefined {
    if (this.hasPeeked) {
      this.hasPeeked = false;
      return this.peekedToken;
    }
    return this.markdownLexer.next();
  }

  peek(): Token | undefined {
    if (this.hasPeeked) return this.peekedToken;
    this.peekedToken = this.next();
    this.hasPeeked = true;
    return this.peekedToken;
  }

  [Symbol.iterator](): Iterator<Token> {
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