import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class VectorParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    let count = 0;
    if (parser.peek()?.type !== "RBRACKET") {
      parser.parseExpression(0, builder);
      count++;
      while (parser.match("COMMA")) {
        parser.parseExpression(0, builder);
        count++;
      }
    }
    parser.consume("RBRACKET");
    builder.emitOpcode(OpCode.VEC_NEW);
    builder.emitIndex(count);
  }
}