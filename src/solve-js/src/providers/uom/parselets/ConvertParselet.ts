import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";

export class ConvertParselet implements PrefixParselet {
	readonly category = "UoM";
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
