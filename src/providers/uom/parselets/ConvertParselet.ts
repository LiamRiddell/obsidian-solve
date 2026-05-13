import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";
import { BindingPower } from "@/engine/parser/BindingPower";

export class ConvertParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(BindingPower.Postfix, builder);
    const unitToken = parser.peek();
    if (unitToken && unitToken.type === "UNIT") {
      parser.consume();
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(unitToken.value);

      if (parser.peek()?.type === "TO") {
        parser.consume("TO");
        const targetToken = parser.consume();
        if (targetToken?.type === "UNIT") {
          builder.emitOpcode(OpCode.PUSH_STRING);
          builder.emitString(targetToken.value);
          builder.emitOpcode(OpCode.UOM_CONVERT_TO);
        } else if (targetToken?.type === "BEST") {
          builder.emitOpcode(OpCode.UOM_BEST);
        }
      } else {
        builder.emitOpcode(OpCode.UOM_CONVERT);
      }
    }
  }
}
