import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * IMPORTANT ASYMMETRY, confirmed by reading `PrecedenceParser.ts` directly
 * rather than assumed: this class is registered for BOTH `IDENT` and `UNIT`
 * token types (see `VariablesPackage.ts`) but is only DEAD CODE for the
 * `IDENT` case. `IDENT` is one of `PrecedenceParser`'s Tier-1 fast-path
 * token types — its inline `IDENT_ID` case (which also holds the
 * Calca-parity Phase 1 user-defined-function definition/call detection,
 * see `parser/UserFunctionParselet.ts`) always handles a bare `IDENT` and
 * `return`s before ever consulting the `ParseletRegistry`, matching
 * `NumberParselet.ts`'s identical situation for `NUMBER`. `UNIT` has NO
 * Tier-1 case, though — a bare unit-letter used as a variable reference
 * (`a + b` where "b" collides with the bits unit) genuinely reaches THIS
 * class's `parse()` for real. That's why the parameter-frame check below
 * (mirroring `IDENT_ID`'s own check exactly) is NOT dead code the way the
 * rest of this class's behavior is for `IDENT` — a function body
 * referencing a parameter whose name collides with a unit (`area(w, h) =
 * w * h`, where "h" lexes as UNIT) resolves through here, not through
 * `PrecedenceParser.ts` at all.
 */
export class IdentifierParselet implements PrefixParselet {
	readonly category = "Variable";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
		// See this class's own doc comment: LIVE for UNIT, dead for IDENT.
		const currentParams = parser.getCurrentFunctionParams();
		if (currentParams) {
			const paramIndex = currentParams.indexOf(token.value);
			if (paramIndex !== -1) {
				builder.emitOpcode(OpCode.LOAD_PARAM);
				builder.emitByte(paramIndex);
				return;
			}
		}
		// Bare identifier: only support variable reads, not writes.
		// Assignments must use the :var = value syntax via VariableParselet (COLON prefix).
		builder.emitOpcode(OpCode.LOAD_VAR);
		builder.emitString(token.value);
	}
}
