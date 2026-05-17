import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

export class Parser {
  private tokens: Token[] = [];
  private current = 0;
  private depth = 0;
  private maxDepth: number;
  private parseletRegistry: ParseletRegistry;

  constructor(parseletRegistry: ParseletRegistry, maxDepth = 50) {
    this.parseletRegistry = parseletRegistry;
    this.maxDepth = maxDepth;
  }

  load(tokens: Token[]): void {
    this.tokens = tokens;
    this.current = 0;
    this.depth = 0;
  }

  parseExpression(bindingPower = 0, builder?: BytecodeBuilder): void {
    this.depth++;
    if (this.depth > this.maxDepth) {
      this.depth--;
      throw ErrorFactory.parsing(
        "NESTING_DEPTH_EXCEEDED",
        `Parse nesting depth ${this.depth} exceeds maximum of ${this.maxDepth}`,
        { maxDepth: this.maxDepth, currentDepth: this.depth }
      );
    }

    const token = this.consume();

    if (!token) {
      this.depth--;
      throw ErrorFactory.parsing("UNEXPECTED_END", "Unexpected end of expression");
    }

    const prefixParselet = this.parseletRegistry.getPrefix(token.type);
    if (!prefixParselet) {
      this.depth--;
      throw ErrorFactory.parsing(
        "NO_PREFIX_PARSELET",
        `No prefix parselet found for token: ${token.type} ("${token.value}")`,
        { tokenType: token.type, tokenValue: token.value }
      );
    }

    if (builder) {
      prefixParselet.parse(this, token, builder);
    }

    while (this.current < this.tokens.length) {
      const nextToken = this.peek();
      if (!nextToken) break;

      const infixParselet = this.parseletRegistry.getInfix(nextToken.type);
      if (!infixParselet) break;
      if (infixParselet.getBindingPower() <= bindingPower) break;

      this.advance();
      if (builder) {
        infixParselet.parse(this, token, nextToken, builder);
      }
    }

    this.depth--;
  }

  consume(expectedType?: string): Token {
    const token = this.tokens[this.current];
    if (!token) {
      throw new Error("Unexpected end of input");
    }
    if (expectedType !== undefined && token.type !== expectedType) {
      throw new Error(
        `Expected token type "${expectedType}" but got "${token.type}" ("${token.value}")`
      );
    }
    this.current++;
    return token;
  }

  match(expectedType: string): boolean {
    const token = this.peek();
    if (token && token.type === expectedType) {
      this.advance();
      return true;
    }
    return false;
  }

  peek(): Token | undefined {
    return this.tokens[this.current];
  }

  previous(): Token | undefined {
    return this.current > 0 ? this.tokens[this.current - 1] : undefined;
  }

  private advance(): void {
    this.current++;
  }
}
