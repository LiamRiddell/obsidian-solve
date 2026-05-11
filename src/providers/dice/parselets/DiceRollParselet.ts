import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class DiceRollParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.consume("LPAREN");
    parser.parseExpression(0, builder);
    parser.consume("COMMA");
    parser.parseExpression(0, builder);
    parser.consume("RPAREN");
    builder.emitOpcode(OpCode.DICE_ROLL);
  }
}