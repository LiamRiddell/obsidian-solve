import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class DiceRangeParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    // roll between X and Y / roll from X to Y
    parser.consume(); // BETWEEN or FROM
    parser.parseExpression(0, builder);
    parser.consume(); // AND or TO
    parser.parseExpression(0, builder);
    builder.emitOpcode(OpCode.DICE_ROLL);
  }
}
