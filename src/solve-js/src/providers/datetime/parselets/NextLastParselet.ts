import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class NextLastParselet implements PrefixParselet {
  constructor(private readonly multiplier: number) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.DATE_NOW);
    parser.parseExpression(0, builder);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(this.multiplier * 24 * 60 * 60 * 1000);
    builder.emitOpcode(OpCode.ADD);
  }
}
