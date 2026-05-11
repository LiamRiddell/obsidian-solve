import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

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