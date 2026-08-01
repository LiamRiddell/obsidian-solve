import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";

const LINE_REF_TYPE_ID = tokenTypeId("LINE_REF");
const SUM_RANGE_CALL_TYPE_ID = tokenTypeId("SUM_RANGE_CALL");
const AVERAGE_RANGE_CALL_TYPE_ID = tokenTypeId("AVERAGE_RANGE_CALL");

/**
 * Fuses `line1` (glued — `ExpressionLexer.tokenizeIdentifier()` already
 * consumes trailing digits into one IDENT token, so "line1" lexes as a
 * SINGLE token, not two) and `line 1` (spaced — two tokens, IDENT "line"
 * + NUMBER) into one `LINE_REF` token carrying the parsed line number as
 * its `.value`.
 *
 * Deliberately does NOT implement the `l1`/`l 1` short alias documented
 * by some competitor apps (Notes Calculator, NumPad) — `l` is one of the
 * most common short variable names in this category of app (length,
 * etc.); shipping `line<N>` alone first and adding a narrower `l<N>`
 * form later, once real usage confirms it's wanted, is the documented
 * v1 scope decision (see the implementation plan / OTHER_APPS_FEATURE_AUDIT.md).
 *
 * Colon-prefix guard: never fires immediately after a variable-definition
 * `COLON`, so `:line1 = 5` / `:line = 5` (a variable named "line1"/"line")
 * stay completely untouched — matches every other trigger-word guard
 * already established this session (e.g. `StockTickerNormalizerRule.ts`).
 *
 * That guard can't be the blanket "any preceding COLON" check the stocks
 * precedent uses, though: `rangeCallNormalizerRule()`'s OWN grammar,
 * `sum(line 1 : line 4)`, ALSO puts a bare COLON directly before the
 * second `line 4` — as a range separator, not a variable sigil. A blanket
 * guard blocks that second fusion, leaving `line 4` as raw
 * `IDENT NUMBER` tokens and breaking `RangeAggregateParselet`, which
 * expects `LINE_REF COLON LINE_REF`. The fix: only suppress fusion when
 * the COLON is genuinely in a variable-definition position — which,
 * since nothing else in this codebase's grammar ever puts a COLON
 * directly after a LINE_REF, is precisely and only NOT the case when the
 * COLON itself is immediately preceded by an already-fused `LINE_REF`
 * (our own range separator). The normalizer's multi-pass loop guarantees
 * the first `line 1` → `LINE_REF` fusion has already landed in an
 * earlier pass by the time this check runs on the second occurrence.
 */
export function lineRefNormalizerRule(): NormalizerRule {
	return {
		name: "lines:line-ref",
		priority: 80,
		match(tokens: Token[], pos: number): NormalizerMatch | null {
			if (pos > 0 && tokens[pos - 1].type === "COLON") {
				const isRangeSeparator = pos > 1 && tokens[pos - 2].type === "LINE_REF";
				if (!isRangeSeparator) return null;
			}
			const token = tokens[pos];
			if (!token) return null;

			// Glued form: "line1" is already a single IDENT token by the time
			// it reaches the normalizer.
			if (token.type === "IDENT") {
				const m = /^line(\d+)$/i.exec(token.value);
				if (m) {
					return {
						consumed: 1,
						replacement: [makeLineRefToken(m[1], token)],
						ruleName: "lines:line-ref",
					};
				}
			}

			// Spaced form: IDENT "line" + NUMBER, two separate tokens.
			if (token.type === "IDENT" && /^line$/i.test(token.value)) {
				const next = tokens[pos + 1];
				if (next && next.type === "NUMBER" && /^\d+$/.test(next.value)) {
					return {
						consumed: 2,
						replacement: [makeLineRefToken(next.value, token)],
						ruleName: "lines:line-ref",
					};
				}
			}

			return null;
		},
	};
}

function makeLineRefToken(lineNumberText: string, sourceToken: Token): Token {
	return new LexerToken(
		"LINE_REF",
		LINE_REF_TYPE_ID,
		lineNumberText,
		lineNumberText,
		sourceToken.offset,
		0,
		sourceToken.line,
		sourceToken.col,
	);
}

/**
 * Fuses `sum(`/`total(`/`average(` — but ONLY when the bare word is
 * IMMEDIATELY followed by `LPAREN` — into a single `SUM_RANGE_CALL`/
 * `AVERAGE_RANGE_CALL` token (sum and total share one token type/parselet,
 * since `sum(...)`/`total(...)` are documented as synonyms — see Numbr's
 * and NumPad's own docs).
 *
 * The lookahead-on-LPAREN guard is what keeps this safe: `:sum = 100`
 * (no following paren) is untouched, and MathPhrasesPackage's existing
 * `"total of X, Y, Z"` phrase (no paren after "of") is a structurally
 * different, non-conflicting shape — confirmed by reading
 * `MathPhrasesPackage.ts` before adding this rule.
 */
export function rangeCallNormalizerRule(): NormalizerRule {
	return {
		name: "lines:range-call",
		priority: 80,
		match(tokens: Token[], pos: number): NormalizerMatch | null {
			const token = tokens[pos];
			if (!token || token.type !== "IDENT") return null;
			const word = token.value.toLowerCase();
			if (word !== "sum" && word !== "total" && word !== "average") return null;
			if (tokens[pos + 1]?.type !== "LPAREN") return null;

			const tokenType = word === "average" ? "AVERAGE_RANGE_CALL" : "SUM_RANGE_CALL";
			const typeId = word === "average" ? AVERAGE_RANGE_CALL_TYPE_ID : SUM_RANGE_CALL_TYPE_ID;
			return {
				consumed: 1,
				replacement: [
					new LexerToken(tokenType, typeId, token.value, token.value, token.offset, 0, token.line, token.col),
				],
				ruleName: "lines:range-call",
			};
		},
	};
}
