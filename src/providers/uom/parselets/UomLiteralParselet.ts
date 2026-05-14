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
    
    // Check if the next token is "to" or "in"
    if (parser.peek()?.type === "TO" || parser.peek()?.type === "IN") {
      parser.consume(); // consume TO or IN
      const targetToken = parser.peek();
      if (targetToken?.type === "UNIT") {
        parser.consume();
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(targetToken.value);
        builder.emitOpcode(OpCode.UOM_CONVERT_TO);
        return;
      }
    }
    
    // Check if the next token is "best"
    if (parser.peek()?.type === "BEST") {
      parser.consume(); // consume BEST
      builder.emitOpcode(OpCode.UOM_BEST);
      return;
    }
    
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}

export { isKnownUnit };
