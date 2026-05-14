import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

export class DiceRollParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const next = parser.peek();
    if (next && (next.type === "BETWEEN" || next.type === "FROM")) {
      // Handle "roll between X and Y" or "roll from X to Y"
      parser.consume(); // BETWEEN or FROM
      // Parse with binding power higher than Sum to avoid "AND" being treated as addition
      parser.parseExpression(BindingPower.Product, builder);
      parser.consume(); // AND or TO
      parser.parseExpression(0, builder);
      builder.emitOpcode(OpCode.DICE_ROLL);
    } else {
      // Handle "roll(X, Y)"
      parser.consume("LPAREN");
      parser.parseExpression(0, builder);
      parser.consume("COMMA");
      parser.parseExpression(0, builder);
      parser.consume("RPAREN");
      builder.emitOpcode(OpCode.DICE_ROLL);
    }
  }
}