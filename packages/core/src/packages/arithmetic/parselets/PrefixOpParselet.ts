import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class PrefixOpParselet implements PrefixParselet {
	readonly category = "Arithmetic";
	constructor(private readonly opcode: OpCode) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(60, builder);
    builder.emitOpcode(this.opcode);
  }
}
