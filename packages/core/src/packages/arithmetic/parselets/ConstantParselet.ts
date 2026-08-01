import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class ConstantParselet implements PrefixParselet {
	readonly category = "Arithmetic";

	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const val = token.type === "PI" ? Math.PI : Math.E;
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(val);
  }
}
