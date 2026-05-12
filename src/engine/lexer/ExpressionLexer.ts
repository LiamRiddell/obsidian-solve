import { MarkdownLexer } from "./MarkdownLexer";
import { Token } from "./Token";

export class ExpressionLexer {
  private inner: MarkdownLexer;

  constructor() {
    this.inner = new MarkdownLexer("expression");
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