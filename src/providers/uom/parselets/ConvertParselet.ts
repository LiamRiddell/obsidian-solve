import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class ConvertParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder);
    const unitToken = parser.consume();
    if (!unitToken || unitToken.type !== "UNIT") return;
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(unitToken.value);
    if (parser.peek()?.type === "TO") {
      parser.consume("TO");
      const targetToken = parser.consume();
      if (targetToken?.type === "UNIT") {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString(targetToken.value);
      } else if (targetToken?.type === "BEST") {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString("best");
      } else if (targetToken?.type === "QUESTION") {
        builder.emitOpcode(OpCode.PUSH_STRING);
        builder.emitString("?");
      }
    }
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}
