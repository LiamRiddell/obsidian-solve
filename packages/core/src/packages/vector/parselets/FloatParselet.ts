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
		// A 1x1 Matrix — see VectorParselet.ts's comment on why this legacy
		// sugar emits MAT_NEW rather than being removed.
		builder.emitOpcode(OpCode.MAT_NEW);
		builder.emitIndex(1);
		builder.emitIndex(1);
	}
}