import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class BinaryOpParselet implements InfixParselet {
	readonly category = "Arithmetic";
	readonly bindingPower: number;
	constructor(
    bp: number,
    private readonly opcode: OpCode
  ) {
    this.bindingPower = bp;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bindingPower, builder);
    builder.emitOpcode(this.opcode);
  }
}
