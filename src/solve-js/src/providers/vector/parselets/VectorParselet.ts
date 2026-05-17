import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class VectorParselet implements PrefixParselet {
  private dimension: number;

  constructor(dimension = 0) {
    this.dimension = dimension;
  }

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");
    let count = 0;
    if (parser.peek()?.type !== "RPAREN") {
      parser.parseExpression(0, builder);
      count++;
      while (parser.match("COMMA")) {
        parser.parseExpression(0, builder);
        count++;
      }
    }
    parser.consume("RPAREN");
    builder.emitOpcode(OpCode.VEC_NEW);
    builder.emitIndex(this.dimension > 0 ? this.dimension : count);
  }
}
