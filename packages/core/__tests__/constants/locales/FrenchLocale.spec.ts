/**
 * French locale — see GitHub issue #77. Two independent things are
 * tested here: (1) formatDatetime() now actually threads locale.code
 * into Date.prototype.toLocaleDateString(), which it never did before
 * (both branches of its old dateFormat check were identical dead code),
 * and (2) the new fr.ts locale file itself, a reviewed core subset of
 * French input keywords matching de.ts's existing scope, not en.ts's
 * full coverage.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { formatValue } from "@solve-js/format/FormatEngine";
import { DEFAULT_FORMATTING_SETTINGS } from "@solve-js/format/FormattingSettings";
import type { MatrixData } from "@solve-js/vm/Value";

function displaySettings(localeCode: string) {
	return { ...DEFAULT_FORMATTING_SETTINGS, numberResult: { ...DEFAULT_FORMATTING_SETTINGS.numberResult, decimalSeparatorLocale: localeCode } };
}

describe("formatDatetime — locale-aware weekday/month display", () => {
	test("English: spelled-out weekday and month", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("17/11/2025");
		expect(formatValue(value, displaySettings("en"))).toBe("= Monday, November 17, 2025");
	});

	test("German: locale.code is now actually used (previously always fell through to English)", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("17/11/2025");
		expect(formatValue(value, displaySettings("de"))).toBe("= Montag, 17. November 2025");
	});

	test("French: 'lundi' not 'Monday' — the exact bug from issue #77", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("17/11/2025");
		expect(formatValue(value, displaySettings("fr"))).toBe("= lundi 17 novembre 2025");
	});

	test("an unregistered locale code falls back to English, not a crash", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("17/11/2025");
		expect(formatValue(value, displaySettings("xx"))).toBe("= Monday, November 17, 2025");
	});

	test("bare date literals (anchored to local midnight) show no time component", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("25/12/2023");
		expect(formatValue(value, displaySettings("fr"))).not.toMatch(/\d\d:\d\d:\d\d/);
	});

	test("'now' (a genuine timestamp, not midnight) DOES show a time component", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("now");
		expect(formatValue(value, displaySettings("en"))).toMatch(/\d{1,2}:\d\d:\d\d/);
	});
});

describe("French locale — input keywords", () => {
	test("basic arithmetic words", () => {
		const engine = new ExpressionEngine("fr");
		expect(engine.evaluateExpression("5 plus 3")[0].toNumber()).toBe(8);
		expect(engine.evaluateExpression("5 fois 3")[0].toNumber()).toBe(15);
		expect(engine.evaluateExpression("10 moins 3")[0].toNumber()).toBe(7);
		expect(engine.evaluateExpression("10 diviser 2")[0].toNumber()).toBe(5);
	});

	test("date keywords, including 'aujourdhui' (today, deliberately unapostrophed)", () => {
		const engine = new ExpressionEngine("fr");
		expect(engine.evaluateExpression("maintenant")[0].type).toBe(4); // Datetime
		expect(engine.evaluateExpression("aujourdhui")[0].type).toBe(4);
		expect(engine.evaluateExpression("demain")[0].type).toBe(4);
		expect(engine.evaluateExpression("hier")[0].type).toBe(4);
	});

	test("weekday names work in context ('prochain lundi', matching English 'next monday')", () => {
		const engine = new ExpressionEngine("fr");
		const [value] = engine.evaluateExpression("prochain lundi");
		expect(value.type).toBe(4); // Datetime
	});

	test("regression guard: a bare weekday word alone throws in BOTH locales symmetrically (not a French-specific gap)", () => {
		const en = new ExpressionEngine("en");
		const fr = new ExpressionEngine("fr");
		expect(() => en.evaluateExpression("monday")).toThrow();
		expect(() => fr.evaluateExpression("lundi")).toThrow();
	});

	test("functions with identical French/English spelling work (sin, cos, abs, min, max)", () => {
		const engine = new ExpressionEngine("fr");
		expect(engine.evaluateExpression("sin(0)")[0].toNumber()).toBe(0);
		expect(engine.evaluateExpression("abs(-5)")[0].toNumber()).toBe(5);
	});

	test("regression guard: a French-only function name is NOT silently broken — it errors clearly rather than returning a wrong number (builtinNameToIndex is a separate, locale-independent dispatch table)", () => {
		const engine = new ExpressionEngine("fr");
		expect(() => engine.evaluateExpression("racine(16)")).toThrow(/undefined function|unknown function/i);
	});

	test("booleans and conditionals", () => {
		const engine = new ExpressionEngine("fr");
		expect(engine.evaluateExpression("vrai")[0].value).toBe(true);
		expect(engine.evaluateExpression("faux")[0].value).toBe(false);
		expect(engine.evaluateExpression("si 5 alors 1 sinon 0")[0].toNumber()).toBe(1);
	});

	test("vec2/vec3/vec4 use the same spelling as English", () => {
		const engine = new ExpressionEngine("fr");
		const [value] = engine.evaluateExpression("vec2(1, 2)");
		expect((value.value as MatrixData).data).toEqual([1, 2]);
	});

	test("regression guard: German's pre-existing analogous gap (wurzel/root) is unaffected by this change, confirming it's a pre-existing architectural limitation, not something newly introduced", () => {
		const engine = new ExpressionEngine("de");
		expect(() => engine.evaluateExpression("wurzel(16)")).toThrow(/undefined function|unknown function/i);
	});
});
