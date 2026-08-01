import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { resolveCurrencyAlias } from "@solve-js/uom/CurrencyAliases";

/**
 * InParselet — handles the standalone `IN` keyword as a postfix conversion.
 *
 * Enables expressions like `125 USD in GBP`, `(a + b) in minutes`, or
 * `price in EUR` where the left side can be any expression (not just a
 * bare UNIT token).
 *
 * When `IN` directly follows a UNIT token (e.g., `25 USD in GBP`), the
 * UomLiteralParselet handles the conversion inline using UOM_CONVERT_TO.
 * This parselet only fires when `IN` follows non-UNIT expressions (e.g.,
 * variables, subexpressions, parenthesized values).
 *
 * Binding power 35 (between Sum=30 and Product=40):
 * - `100 + 25 in GBP` → `100 + (25 in GBP)`  (in binds tighter than +)
 * - `25 in GBP * 2` → `(25 in GBP) * 2`      (in binds looser than *)
 */
export class InParselet implements InfixParselet {
	readonly category = "UoM";
	readonly bindingPower = 35;

	parse(parser: Parser, _left: Token, _token: Token, builder: BytecodeBuilder): void {
		const targetToken = parser.peek();
		// Accept UNIT, currency symbols, bare IDENT, or IN (for cases like
		// "3 ft in in" where the target unit is tokenized as a keyword).
		if (targetToken && (
			targetToken.type === "UNIT" ||
			targetToken.type === "DOLLAR" ||
			targetToken.type === "POUND" ||
			targetToken.type === "EURO" ||
			targetToken.type === "YEN" ||
			targetToken.type === "RUBLE" ||
			targetToken.type === "WON" ||
			targetToken.type === "CURRENCY_SYMBOL" ||
			targetToken.type === "IDENT" ||
			targetToken.type === "IN"
		)) {
			parser.consume();
			builder.emitOpcode(OpCode.PUSH_STRING);
			builder.emitString(resolveCurrencyAlias(targetToken.value) ?? targetToken.value);
			builder.emitOpcode(OpCode.UOM_CONVERT_IN);
		}
		// If the next token isn't a valid target unit, silently skip.
		// The left expression remains on the stack unchanged.
	}
}
