import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class FloatParselet implements PrefixParselet {
	readonly category = "Float";
	parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
		parser.consume("LPAREN");
		parser.parseExpression(0, builder);
		parser.consume("RPAREN");
		builder.emitOpcode(OpCode.ARR_NEW);
		builder.emitIndex(1);
	}
}