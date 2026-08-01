import { describe, expect, test } from "@jest/globals";
import { Token } from "@solve-js/lexer/Token";
import { tryParseDatePhrase } from "@solve-js/packages/stocks/DatePhrase";

function tok(type: string, value: string): Token {
	return { type, typeId: 0, value, text: value, offset: 0, lineBreaks: 0, line: 1, col: 1 } as Token;
}
const NUM = (v: string) => tok("NUMBER", v);
const IDENT = (v: string) => tok("IDENT", v);
const COMMA = () => tok("COMMA", ",");
const SLASH = () => tok("SLASH", "/");
const MINUS = () => tok("MINUS", "-");
const STRING = (v: string) => tok("STRING", v);

/** Queue-based mock parser — consume() validates the expected type like the real PrecedenceParser does. */
function mockParser(tokens: Token[]) {
	const queue = [...tokens];
	return {
		peek: () => (queue.length > 0 ? queue[0] : undefined),
		consume: (expected?: string) => {
			const t = queue.shift();
			if (!t) throw new Error("Unexpected end of input");
			if (expected && t.type !== expected) {
				throw new Error(`Expected token type "${expected}" but got "${t.type}"`);
			}
			return t;
		},
	} as any;
}

describe("tryParseDatePhrase", () => {
	test("returns null (consumes nothing) for a non-date-shaped token", () => {
		const parser = mockParser([STRING("hello")]);
		expect(tryParseDatePhrase(parser)).toBeNull();
	});

	test("'April 12, 2005' (month name, comma) -> 2005-04-12", () => {
		const parser = mockParser([IDENT("April"), NUM("12"), COMMA(), NUM("2005")]);
		const result = tryParseDatePhrase(parser);
		expect(result?.isoDate).toBe("2005-04-12");
	});

	test("'April 12 2005' (month name, no comma) -> 2005-04-12", () => {
		const parser = mockParser([IDENT("April"), NUM("12"), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("'12 April 2005' (day first) -> 2005-04-12", () => {
		const parser = mockParser([NUM("12"), IDENT("April"), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("'12 April, 2005' (day first, comma) -> 2005-04-12", () => {
		const parser = mockParser([NUM("12"), IDENT("April"), COMMA(), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("month name is case-insensitive and accepts abbreviations", () => {
		const parser = mockParser([IDENT("dec"), NUM("25"), COMMA(), NUM("2020")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2020-12-25");
	});

	test("SLASH numeric date is MM/DD/YYYY (US convention, documented)", () => {
		const parser = mockParser([NUM("4"), SLASH(), NUM("12"), SLASH(), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("MINUS numeric date is ISO YYYY-MM-DD when the first group is 4 digits", () => {
		const parser = mockParser([NUM("2005"), MINUS(), NUM("04"), MINUS(), NUM("12")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("MINUS numeric date is US MM-DD-YYYY when the first group is NOT 4 digits", () => {
		const parser = mockParser([NUM("04"), MINUS(), NUM("12"), MINUS(), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-04-12");
	});

	test("day/month transposition regression guard: day=25 (>12) must not be silently swapped with month=03", () => {
		// If a future edit swapped (month, day) argument order, "03-25-2005"
		// would be built as (year=2005, month=25, day=03) — an invalid
		// month — and this would throw instead of silently returning the
		// wrong date. Picked per the datetime-literal work's own lesson:
		// day != month AND day > 12 makes a swap bug visible instead of
		// accidentally passing.
		const parser = mockParser([NUM("03"), MINUS(), NUM("25"), MINUS(), NUM("2005")]);
		expect(tryParseDatePhrase(parser)?.isoDate).toBe("2005-03-25");
	});

	test("rejects an invalid calendar date (Feb 30) rather than silently rolling it over", () => {
		const parser = mockParser([IDENT("February"), NUM("30"), COMMA(), NUM("2020")]);
		expect(() => tryParseDatePhrase(parser)).toThrow(/not a valid calendar date/);
	});

	test("rejects a 2-digit year (out of scope by design — see module doc)", () => {
		const parser = mockParser([NUM("4"), SLASH(), NUM("12"), SLASH(), NUM("05")]);
		expect(() => tryParseDatePhrase(parser)).toThrow(/4-digit year/);
	});

	test("throws when a NUMBER is followed by something that isn't a valid date continuation", () => {
		const parser = mockParser([NUM("12"), STRING("banana")]);
		expect(() => tryParseDatePhrase(parser)).toThrow(/Expected a date/);
	});
});
