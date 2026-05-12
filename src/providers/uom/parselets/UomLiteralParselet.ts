import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";
import { isKnownUnit } from "@/engine/lexer/units";

export class UomLiteralParselet implements InfixParselet {
  getBindingPower(): number {
    return BindingPower.Postfix;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    const unit = token.value;
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(unit);
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}

export { isKnownUnit };