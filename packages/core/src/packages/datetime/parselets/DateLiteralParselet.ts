import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * Pushes a datetime literal (25/12/2023, 12-25-2023, 2023-12-25, 25.12.2023)
 * whose epoch-ms was already computed by {@link dateLiteralNormalizerRule}
 * during token fusion — this parselet just emits the constant.
 */
export class DateLiteralParselet implements PrefixParselet {
	readonly category = "Date/Time";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.DATE_LITERAL);
    builder.emitNumber(Number(token.value));
  }
}
