import { MarkdownLexer } from "./MarkdownLexer";
import { Token } from "@solve-js/lexer/Token";

export class ExpressionLexer {
  private inner: MarkdownLexer;

  constructor(localeCode = "en") {
    this.inner = new MarkdownLexer(localeCode, "main");
  }

  reset(input: string): void {
    this.inner.reset(input);
  }

  next(): Token | undefined {
    return this.inner.next();
  }

  [Symbol.iterator](): Iterator<Token> {
    return this.inner[Symbol.iterator]();
  }
}