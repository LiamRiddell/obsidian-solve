import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/** `true` / `false` boolean literals. */
export class BooleanLiteralParselet implements PrefixParselet {
	readonly category = "Conditionals";

	constructor(private readonly value: boolean) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_BOOLEAN);
    builder.emitByte(this.value ? 1 : 0);
  }
}
