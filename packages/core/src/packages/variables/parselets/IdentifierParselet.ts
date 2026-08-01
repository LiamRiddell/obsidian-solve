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
 * token types — its inline `IDENT_ID` case always handles a bare `IDENT`
 * and `return`s before ever consulting the `ParseletRegistry`, matching
 * `NumberParselet.ts`'s identical situation for `NUMBER`. `UNIT` has NO
 * Tier-1 case, though — a bare unit-letter used as a variable reference
 * (`a + b` where "b" collides with the bits unit) genuinely reaches THIS
 * class's `parse()` for real.
 *
 * No special handling is needed here for user-defined-function parameter
 * names that collide with a unit abbreviation (e.g. `area(w, h) = w * h`,
 * where "h" lexes as UNIT) — see `parser/BytecodeBuilder.ts`'s
 * `UserFunctionDef` doc comment: parameter resolution happens dynamically
 * at the VM level (the innermost call frame is checked before the flat
 * variable store), so a bare `LOAD_VAR` is correct for EVERY identifier
 * read, parameter or not.
 */
export class IdentifierParselet implements PrefixParselet {
	readonly category = "Variable";
	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
		// Bare identifier: only support variable reads, not writes.
		// Assignments must use the :var = value syntax via VariableParselet (COLON prefix).
		builder.emitOpcode(OpCode.LOAD_VAR);
		builder.emitString(token.value);
	}
}
