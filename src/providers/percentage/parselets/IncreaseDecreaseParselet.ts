import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class IncreaseDecreaseParselet implements PrefixParselet {
  constructor(private readonly multiplier: number) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder);
    // skip "by" keyword
    const next = parser.peek();
    if (next && (next.type === "IDENT" || next.type === "BY")) {
      parser.consume();
    }
    parser.parseExpression(0, builder);
    // match optional PERCENT
    if (parser.peek()?.type === "PERCENT") parser.consume();
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(100);
    builder.emitOpcode(OpCode.DIV);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(1);
    builder.emitOpcode(this.multiplier > 0 ? OpCode.ADD : OpCode.SUB);
    builder.emitOpcode(OpCode.MUL);
  }
}