import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

export class VariableParselet implements PrefixParselet {
  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    // Handle :var syntax
    const nameToken = parser.consume();
    if (nameToken.type !== "IDENT") {
      throw new Error(`Expected identifier after colon, got ${nameToken.type}`);
    }
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
