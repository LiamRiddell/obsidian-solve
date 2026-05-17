import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class BinaryOpParselet implements InfixParselet {
  constructor(
    private readonly bp: number,
    private readonly opcode: OpCode
  ) {}

  getBindingPower(): number {
    return this.bp;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.bp, builder);
    builder.emitOpcode(this.opcode);
  }
}
