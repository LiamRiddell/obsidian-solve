import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class IncreaseDecreaseParselet implements PrefixParselet {
	readonly category = "Percentage";
	constructor(private readonly multiplier: number) {}

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder);
    const next = parser.peek();
    if (next && (next.type === "IDENT" || next.type === "BY")) {
      parser.consume();
    }
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(1);
    parser.parseExpression(0, builder);
    if (parser.peek()?.type === "PERCENT") parser.consume();
    builder.emitOpcode(this.multiplier > 0 ? OpCode.ADD : OpCode.SUB);
    builder.emitOpcode(OpCode.MUL);
  }
}
