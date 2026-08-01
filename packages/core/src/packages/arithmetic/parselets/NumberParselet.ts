import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ILocale, getLocale } from "@solve-js/constants/locales";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Matches a CHAINED thousands-grouped integer using "." as the group
 * separator — e.g. "1.234.567" — regardless of the active locale. Two or
 * more repetitions is the key: a genuine decimal literal can never
 * contain more than one ".", so this shape is unambiguous, unlike a
 * single group ("1.234") which is deliberately left alone below (could
 * mean 1234 grouped, or 1.234 as a three-decimal-place fraction — far
 * more commonly the latter in this project's "en"-default locale, so
 * changing that interpretation is out of scope here).
 */
const CHAINED_DOT_THOUSANDS_GROUPS = /^\d{1,3}(\.\d{3}){2,}$/;

/**
 * NOTE: for real evaluation, this class's `parse()` is dead code.
 * PrecedenceParser's Tier-1 fast-path switch handles NUMBER_ID inline
 * (with its own copy of this exact logic) and always `return`s before
 * ever falling through to the Tier-2 parselet-registry lookup that would
 * invoke this. This class stays registered so the "matched parselets"
 * diagnostic view isn't blind to NUMBER tokens, and so direct unit tests
 * of parselet behavior keep working — but any fix here must be mirrored
 * in PrecedenceParser.ts's NUMBER_ID case to actually take effect.
 */
export class NumberParselet implements PrefixParselet {
	readonly category = "Arithmetic";

	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
		let v: number;
		const raw = token.value;
		if (raw.startsWith("0x") || raw.startsWith("0X")) {
			v = parseInt(raw, 16);
			if (Number.isNaN(v)) {
				// Matches PrecedenceParser.ts's NUMBER_ID fast path (the
				// actual production code path this dead-code parselet
				// mirrors) — a raw Error here would skip
				// ThreeTierEvaluator's DAG-preservation enrichment on parse
				// failure, which specifically checks for EngineError.
				throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid hex literal: "${raw}"`, { raw });
			}
		} else if (raw.startsWith("0b") || raw.startsWith("0B")) {
			v = parseInt(raw.slice(2), 2);
			if (Number.isNaN(v)) {
				throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid binary literal: "${raw}"`, { raw });
			}
		} else if (raw.startsWith("0o") || raw.startsWith("0O")) {
			v = parseInt(raw.slice(2), 8);
			if (Number.isNaN(v)) {
				throw ErrorFactory.parsing("INVALID_NUMBER_LITERAL", `Invalid octal literal: "${raw}"`, { raw });
			}
		} else if (CHAINED_DOT_THOUSANDS_GROUPS.test(raw)) {
			// The lexer accepts "." as a thousands-group separator
			// independent of locale (see ExpressionLexer's number-scanning
			// "Thousands separators" block), but the locale-based
			// normalization below only strips the ACTIVE locale's own
			// designated thousandsSeparator character — for "en" that's
			// ",", not ".", so a chained dot-grouped number like
			// "1.234.567" fell through to parseFloat() untouched, which
			// stops at the second "." and silently truncated it to 1.234
			// (over 99% of the digits dropped, with no error). Handled as
			// its own case, ahead of the locale-aware path, since it's
			// unambiguous regardless of locale.
			v = parseFloat(raw.split(".").join(""));
		} else {
			// Normalize number based on locale separators
			const locale = getLocale(parser.getLocaleCode());
			const decimalSep = locale.display.decimalSeparator;
			const thousandsSep = locale.display.thousandsSeparator;

			let normalized = raw;
		// Replace thousands separator with nothing (split+join avoids per-call RegExp compilation)
		if (thousandsSep) {
			normalized = normalized.split(thousandsSep).join("");
		}
			// Replace locale decimal separator with "." for JavaScript parsing
			if (decimalSep && decimalSep !== ".") {
				normalized = normalized.replace(decimalSep, ".");
			}
			v = parseFloat(normalized);
		}
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(v);
	}
}
