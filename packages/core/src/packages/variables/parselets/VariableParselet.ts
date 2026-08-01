import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

export class VariableParselet implements PrefixParselet {
	readonly category = "Variable";
	parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    // Handle :var syntax — accept IDENT and UNIT tokens as variable names.
    // UNIT tokens occur when the variable name collides with a known unit
    // (e.g., ":b = 5" — "b" is a known unit for bits). The colon prefix
    // unambiguously signals a variable definition context, so the token
    // type override is safe and intentional.
    const nameToken = parser.consume();
    if (nameToken.type !== "IDENT" && nameToken.type !== "UNIT") {
      throw ErrorFactory.parsing(
        'EXPECTED_IDENTIFIER',
        `Expected identifier or unit after colon, got ${nameToken.type}`,
        { tokenType: nameToken.type }
      );
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
