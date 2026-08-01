import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class IdentifierParselet implements PrefixParselet {
	readonly category = "Variable";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
		// Bare identifier: only support variable reads, not writes.
		// Assignments must use the :var = value syntax via VariableParselet (COLON prefix).
		builder.emitOpcode(OpCode.LOAD_VAR);
		builder.emitString(token.value);
	}
}