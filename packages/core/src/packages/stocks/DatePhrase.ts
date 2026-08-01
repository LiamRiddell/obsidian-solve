import { Parser } from "@solve-js/parser/Parser";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Self-contained date-phrase parser for the Stocks package's `on <date>`
 * suffix (`stock(AAPL) on April 12, 2005`, `AAPL close on 2005-04-12`, ...).
 *
 * This does NOT reuse `packages/core`'s general-purpose `DATETIME_LITERAL`
 * work (date-only numeric literals in DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD,
 * DD.MM.YYYY — `packages/datetime/normalizer/DateLiteralNormalizerRule.ts`,
 * ported from the former `feat/safety-limits-datetime-literals` branch) —
 * this is a smaller, independent grammar scoped to exactly what a
 * stock-history query needs: month-name dates (the task's own worked
 * example, "April 12, 2005") plus SLASH/MINUS-separated numeric dates. Two
 * DELIBERATE differences from that general-purpose rule's design, both
 * narrowing scope rather than risking a subtle bug:
 *
 * - **4-digit years only.** No 2-digit-year pivot logic (the general rule's
 *   `strptime("%y")`-style 00-68/69-99 split) — a stock historical lookup
 *   realistically always names a 4-digit year, and skipping the pivot
 *   removes a whole class of ambiguity to test.
 * - **SLASH is MM/DD/YYYY (US), not DD/MM/YYYY (European).** The
 *   general-purpose rule picked European for `packages/core`'s date
 *   literal; this package is scoped to US-listed tickers (NASDAQ/NYSE), so
 *   US-style slash dates match user expectation better here. Documented
 *   explicitly because it's the OPPOSITE convention from the other rule —
 *   do not assume they agree if this is ever unified with that work.
 *
 * MINUS follows the same "4-digit first group -> ISO, else US" rule the
 * general-purpose rule uses, and every candidate is validated by
 * constructing a real `Date` and checking the components didn't roll over
 * (e.g. a claimed "Feb 30") — same lesson as that rule's own doc comment:
 * this is what makes the parse safe against malformed input, not a
 * decoration.
 */

const MONTH_NAMES: Record<string, number> = {
	jan: 0, january: 0,
	feb: 1, february: 1,
	mar: 2, march: 2,
	apr: 3, april: 3,
	may: 4,
	jun: 5, june: 5,
	jul: 6, july: 6,
	aug: 7, august: 7,
	sep: 8, sept: 8, september: 8,
	oct: 9, october: 9,
	nov: 10, november: 10,
	dec: 11, december: 11,
};

export interface ParsedDatePhrase {
	/** ISO calendar date, e.g. "2005-04-12". */
	isoDate: string;
	/** The original token text, reassembled, for error messages/diagnostics. */
	raw: string;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** Construct a real Date and confirm year/month/day didn't roll over (e.g. Feb 30 -> Mar 2). */
function validateAndFormat(year: number, monthIndex: number, day: number, raw: string): ParsedDatePhrase {
	const d = new Date(year, monthIndex, day);
	if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) {
		throw ErrorFactory.parsing(
			"STOCKS_INVALID_DATE",
			`"${raw}" is not a valid calendar date`,
		);
	}
	return { isoDate: `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`, raw };
}

function requireYear(text: string, raw: string): number {
	if (!/^\d{4}$/.test(text)) {
		throw ErrorFactory.parsing(
			"STOCKS_INVALID_DATE",
			`Expected a 4-digit year in "${raw}", got "${text}"`,
		);
	}
	return parseInt(text, 10);
}

/**
 * Attempt to consume a date phrase from the parser at the current
 * position. Returns `null` (consuming NOTHING) if the next token doesn't
 * look like the start of any supported date shape, so callers can decide
 * how to react (this helper is speculative only up to that first check —
 * once it commits past the first token, a malformed continuation is a
 * hard parse error, not a silent `null`, matching
 * `time/parselets/shared/ZoneReference.ts`'s same "commit once confident"
 * discipline).
 */
export function tryParseDatePhrase(parser: Parser): ParsedDatePhrase | null {
	const first = parser.peek();
	if (!first) return null;

	// ── Numeric SLASH/MINUS form: NUMBER SEP NUMBER SEP NUMBER ──
	// or "12 April 2005" (NUMBER IDENT [COMMA] NUMBER) — both start with a
	// NUMBER, disambiguated below by what follows it. Consume-then-check is
	// safe here (rather than needing 2-token lookahead, which `Parser`
	// doesn't expose): every branch below either completes a valid date or
	// throws — there's no alternative parse to back out to once a NUMBER is
	// found in this position.
	if (first.type === "NUMBER") {
		const g1 = parser.consume();
		const sepTok = parser.peek();
		if (sepTok && (sepTok.type === "SLASH" || sepTok.type === "MINUS")) {
			const sepType = sepTok.type;
			parser.consume();
			const g2 = parser.consume("NUMBER");
			parser.consume(sepType);
			const g3 = parser.consume("NUMBER");
			const raw = `${g1.value}${sepType === "SLASH" ? "/" : "-"}${g2.value}${sepType === "SLASH" ? "/" : "-"}${g3.value}`;

			if (sepType === "SLASH") {
				// US convention: MM/DD/YYYY — see module doc.
				const month = parseInt(g1.value, 10);
				const day = parseInt(g2.value, 10);
				const year = requireYear(g3.value, raw);
				return validateAndFormat(year, month - 1, day, raw);
			} else {
				// MINUS: ISO YYYY-MM-DD if the first group is exactly 4 digits, else US MM-DD-YYYY.
				if (/^\d{4}$/.test(g1.value)) {
					const year = parseInt(g1.value, 10);
					const month = parseInt(g2.value, 10);
					const day = parseInt(g3.value, 10);
					return validateAndFormat(year, month - 1, day, raw);
				}
				const month = parseInt(g1.value, 10);
				const day = parseInt(g2.value, 10);
				const year = requireYear(g3.value, raw);
				return validateAndFormat(year, month - 1, day, raw);
			}
		}

		// ── "12 April 2005" — NUMBER IDENT [COMMA] NUMBER ──
		const monthTok = parser.peek();
		if (monthTok && monthTok.type === "IDENT" && MONTH_NAMES[monthTok.value.toLowerCase()] !== undefined) {
			const monthIndex = MONTH_NAMES[monthTok.value.toLowerCase()];
			parser.consume(); // month name
			if (parser.peek()?.type === "COMMA") parser.consume();
			const yearTok = parser.consume("NUMBER");
			const raw = `${g1.value} ${monthTok.value} ${yearTok.value}`;
			const year = requireYear(yearTok.value, raw);
			return validateAndFormat(year, monthIndex, parseInt(g1.value, 10), raw);
		}

		throw ErrorFactory.parsing(
			"STOCKS_INVALID_DATE",
			`Expected a date after "on" (e.g. "April 12, 2005" or "4/12/2005"), got "${g1.value}"`,
		);
	}

	// ── "April 12, 2005" / "April 12 2005" — IDENT NUMBER [COMMA] NUMBER ──
	if (first.type === "IDENT" && MONTH_NAMES[first.value.toLowerCase()] !== undefined) {
		const monthIndex = MONTH_NAMES[first.value.toLowerCase()];
		parser.consume(); // month name
		const dayTok = parser.consume("NUMBER");
		if (parser.peek()?.type === "COMMA") parser.consume();
		const yearTok = parser.consume("NUMBER");
		const raw = `${first.value} ${dayTok.value}, ${yearTok.value}`;
		const year = requireYear(yearTok.value, raw);
		return validateAndFormat(year, monthIndex, parseInt(dayTok.value, 10), raw);
	}

	return null;
}
