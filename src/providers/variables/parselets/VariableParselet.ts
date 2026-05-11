import { PrefixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

export class VariableParselet implements PrefixParselet {
  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    const nameToken = parser.consume();
    const varName = nameToken.value;

    if (parser.peek()?.type === "EQUALS") {
      parser.consume("EQUALS");
      parser.parseExpression(0, builder);
      builder.emitOpcode(OpCode.STORE_VAR);
      builder.emitString(varName);
    } else {
      builder.emitOpcode(OpCode.LOAD_VAR);
      builder.emitString(varName);
    }
  }
}