import { ExpressionLexer } from "./ExpressionLexer";
import { Token } from "@/engine/lexer/Token";
import { LexerState } from "@/engine/lexer/LexerState";
import { getTokenHighlightClass } from "@/engine/lexer/TokenHighlightMap";

export class Lexer {
  private expressionLexer: ExpressionLexer;
  private currentState: LexerState = LexerState.Main;
  private peekedToken: Token | undefined;
  private hasPeeked = false;

  constructor(localeCode = "en") {
    this.expressionLexer = new ExpressionLexer(localeCode);
  }

  reset(input: string, state?: LexerState): void {
    this.currentState = state ?? LexerState.Main;
    this.expressionLexer.reset(input);
    this.hasPeeked = false;
    this.peekedToken = undefined;
  }

  next(): Token | undefined {
    if (this.hasPeeked) {
      this.hasPeeked = false;
      return this.peekedToken;
    }
    return this.expressionLexer.next();
  }

  peek(): Token | undefined {
    if (this.hasPeeked) return this.peekedToken;
    this.peekedToken = this.next();
    this.hasPeeked = true;
    return this.peekedToken;
  }

  [Symbol.iterator](): Iterator<Token> {
    return this.expressionLexer[Symbol.iterator]();
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
