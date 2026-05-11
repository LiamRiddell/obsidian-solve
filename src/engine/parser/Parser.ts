import { PrefixParselet, InfixParselet } from "@/engine/parser/Parselet";
import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";

export class Parser {
  private tokens: Token[] = [];
  private current = 0;
  private parseletRegistry: ParseletRegistry;

  constructor(parseletRegistry: ParseletRegistry) {
    this.parseletRegistry = parseletRegistry;
  }

  load(tokens: Token[]): void {
    this.tokens = tokens;
    this.current = 0;
  }

  parseExpression(bindingPower = 0, builder?: BytecodeBuilder): void {
    const token = this.consume();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    const prefixParselet = this.parseletRegistry.getPrefix(token.type);
    if (!prefixParselet) {
      throw new Error(`No prefix parselet found for token: ${token.type} ("${token.value}")`);
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