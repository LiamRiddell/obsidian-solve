/**
 * `[[<date>]]` — Obsidian's wikilink syntax wrapped around a date, as
 * produced by plugins like Natural Language Dates when linking to a
 * daily note. See GitHub issue #67.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

describe("daily note link — [[date]] unwrapping", () => {
	test("a bare bracketed date evaluates to the same Datetime as the unwrapped literal", () => {
		const engine = new ExpressionEngine();
		const [wrapped] = engine.evaluateExpression("[[2024-01-15]]");
		const [bare] = engine.evaluateExpression("2024-01-15");
		expect(wrapped.type).toBe(ValueType.Datetime);
		expect(wrapped.value).toBe(bare.value);
	});

	test("works inside a larger expression, not just standalone", () => {
		const engine = new ExpressionEngine();
		const [wrapped] = engine.evaluateExpression("[[2024-01-15]] + 5 days");
		const [bare] = engine.evaluateExpression("2024-01-15 + 5 days");
		expect(wrapped.value).toBe(bare.value);
	});

	test("works on the right-hand side of an operator too", () => {
		const engine = new ExpressionEngine();
		const [wrapped] = engine.evaluateExpression("now - [[2024-01-15]]");
		const [bare] = engine.evaluateExpression("now - 2024-01-15");
		// Both computed within the same test run, a few ms apart at most —
		// "now" drifts by less than a millisecond between the two calls, so
		// compare the whole-day count rather than the exact duration.
		expect(Math.round((wrapped.value as number) / 86400000)).toBe(Math.round((bare.value as number) / 86400000));
	});

	test("other date formats (slash, dot) also unwrap correctly", () => {
		const engine = new ExpressionEngine();
		const [wrapped] = engine.evaluateExpression("[[25/12/2023]]");
		const [bare] = engine.evaluateExpression("25/12/2023");
		expect(wrapped.value).toBe(bare.value);
	});

	test("regression guard: bracket-wrapped non-date content is NOT unwrapped (only fires on a real date literal)", () => {
		const engine = new ExpressionEngine();
		const wrappedResult = engine.evaluateLineWithDebug(1, "[[not a date]]");
		expect(wrappedResult.tokens.some((t: any) => t.type === "LBRACKET")).toBe(true);
	});

	test("regression guard: single-bracket syntax (unrelated, pre-existing, unimplemented) is unaffected", () => {
		const engine = new ExpressionEngine();
		const before = engine.evaluateLineWithDebug(1, "[1, 2, 3]");
		expect(before.tokens[0].type).toBe("LBRACKET");
	});

	test("regression guard: a plain double-bracket page-title link isn't misinterpreted", () => {
		const engine = new ExpressionEngine();
		const result = engine.evaluateLineWithDebug(1, "[[My Page Title]]");
		expect(result.tokens.some((t: any) => t.type === "DATETIME_LITERAL")).toBe(false);
	});
});
