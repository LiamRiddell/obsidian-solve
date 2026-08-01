import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class NextLastParselet implements PrefixParselet {
	readonly category = "Date/Time";
	private readonly msOffset: number;
	constructor(private readonly multiplier: number) {
		this.msOffset = this.multiplier * 24 * 60 * 60 * 1000;
	}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.DATE_NOW);
    parser.parseExpression(0, builder);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(this.msOffset);
    builder.emitOpcode(OpCode.ADD);
  }
}
