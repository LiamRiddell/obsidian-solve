import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

const MS_PER = {
  DURATION_SECOND: 1000,
  DURATION_MINUTE: 60 * 1000,
  DURATION_HOUR: 60 * 60 * 1000,
  DURATION_DAY: 24 * 60 * 60 * 1000,
  DURATION_WEEK: 7 * 24 * 60 * 60 * 1000,
  DURATION_MONTH: 30 * 24 * 60 * 60 * 1000,
  DURATION_YEAR: 365 * 24 * 60 * 60 * 1000,
};

export class DurationPostfixParselet implements InfixParselet {
  constructor(private readonly tokenType: string) {}

  getBindingPower(): number {
    return BindingPower.Postfix;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    const ms = MS_PER[token.type as keyof typeof MS_PER] ?? 1000;
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(ms);
    builder.emitOpcode(OpCode.MUL);
  }
}