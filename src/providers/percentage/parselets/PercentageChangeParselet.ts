import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

export class PercentageChangeParselet implements InfixParselet {
  getBindingPower(): number {
    return BindingPower.Conditional;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(this.getBindingPower(), builder);
    builder.emitOpcode(OpCode.PUSH_NUMBER);
    builder.emitNumber(100);
    builder.emitOpcode(OpCode.MUL);
  }
}