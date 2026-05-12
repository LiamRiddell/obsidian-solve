import { MarkdownLexer } from "./MarkdownLexer";
import { Token } from "./Token";

export class ExpressionLexer {
  private inner: MarkdownLexer;

  constructor(localeCode = "en") {
    this.inner = new MarkdownLexer(localeCode, "expression");
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