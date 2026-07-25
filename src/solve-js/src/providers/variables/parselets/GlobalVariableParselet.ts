import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * `global :name` (read) / `global :name = expr` (write) — a document-
 * spanning variable, backed by the process-wide GlobalVariableStore rather
 * than this VM's own local scope. Registered as the prefix parselet for the
 * `GLOBAL` keyword token (see en.ts's keywordMap), so `_token` here is
 * already-consumed `global`; this parselet manually consumes the rest of
 * its own multi-token grammar — the same shape IncreaseDecreaseParselet
 * uses for "increase X by Y%".
 *
 * Reuses VariableParselet's exact name/`=`-detection logic, just emitting
 * the GLOBAL opcodes instead — kept as a sibling class rather than a shared
 * base/parameterization since the two grammars (`:name` vs `global :name`)
 * differ in how many tokens precede the name, and the duplication here is
 * small and unlikely to drift.
 */
export class GlobalVariableParselet implements PrefixParselet {
	readonly category = "Variable";
	parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
		// consume("COLON") throws UNEXPECTED_TOKEN_TYPE itself if the next
		// token isn't a colon — no separate check needed here.
		parser.consume("COLON");

		// Same IDENT/UNIT acceptance as VariableParselet — a global variable
		// named after a known unit (e.g. "global :b = 5") is unambiguous once
		// preceded by "global :", same reasoning as the local case.
		const nameToken = parser.consume();
		if (nameToken.type !== "IDENT" && nameToken.type !== "UNIT") {
			throw ErrorFactory.parsing(
				'EXPECTED_IDENTIFIER',
				`Expected identifier after 'global :', got ${nameToken.type}`,
				{ tokenType: nameToken.type }
			);
		}
		const varName = nameToken.value;

		if (parser.peek()?.type === "EQUALS") {
			parser.consume("EQUALS");
			parser.parseExpression(0, builder);
			builder.emitOpcode(OpCode.STORE_GLOBAL_VAR);
			builder.emitString(varName);
		} else {
			builder.emitOpcode(OpCode.LOAD_GLOBAL_VAR);
			builder.emitString(varName);
		}
	}
}
