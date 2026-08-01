import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/** CALL_BUILTIN index for diceRoll(from, to). Matches VMBuiltins.ts index 37. */
const DICE_ROLL_BUILTIN = 37;

export class DiceRangeParselet implements PrefixParselet {
	readonly category = "Dice";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    // roll between X and Y / roll from X to Y
    parser.consume(); // BETWEEN or FROM
    parser.parseExpression(0, builder);
    parser.consume(); // AND or TO
    parser.parseExpression(0, builder);
    builder.emitOpcode(OpCode.CALL_BUILTIN);
    builder.emitIndex(DICE_ROLL_BUILTIN);
    builder.emitIndex(2); // argc = 2
  }
}
