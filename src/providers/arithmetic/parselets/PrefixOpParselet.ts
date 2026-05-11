import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class PrefixOpParselet implements PrefixParselet {
  constructor(private readonly opcode: OpCode) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(60, builder);
    builder.emitOpcode(this.opcode);
  }
}