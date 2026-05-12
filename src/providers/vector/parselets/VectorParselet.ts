import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

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