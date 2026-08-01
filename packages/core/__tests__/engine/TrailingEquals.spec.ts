/**
 * A single trailing bare "=" with nothing after it (e.g. "355/113=") is
 * tolerated rather than rejected as an unexpected trailing token — see
 * GitHub issue #65. EQUALS is never registered as an infix operator
 * anywhere in this grammar, so it can't be a legitimate second operand or
 * a typo'd continuation; this is deliberately narrower than tolerating
 * arbitrary trailing tokens, which would reopen the exact
 * silently-wrong-answer bug UNEXPECTED_TRAILING_TOKEN exists to prevent
 * (see ExpressionEngine.ts's parseExpression() doc comment).
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("trailing bare '=' tolerance", () => {
	test("a plain expression with a trailing '=' evaluates normally", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("355/113=");
		expect(value.toNumber()).toBeCloseTo(Math.PI, 4);
	});

	test("a space before the trailing '=' is also tolerated", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("5 + 3 =");
		expect(value.toNumber()).toBe(8);
	});

	test("a variable assignment with a trailing '=' still works", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression(":x = 5=");
		expect(value.toNumber()).toBe(5);
	});

	test("regression guard: arbitrary trailing tokens still throw (the bug UNEXPECTED_TRAILING_TOKEN exists to catch)", () => {
		const engine = new ExpressionEngine();
		expect(() => engine.evaluateExpression("5 3")).toThrow(/unexpected token/i);
	});

	test("regression guard: a double trailing '==' still throws, not silently accepted", () => {
		const engine = new ExpressionEngine();
		expect(() => engine.evaluateExpression("355/113==")).toThrow();
	});

	test("regression guard: real content after the trailing '=' still throws", () => {
		const engine = new ExpressionEngine();
		expect(() => engine.evaluateExpression("355/113= 5")).toThrow(/unexpected token/i);
	});

	test("regression guard: a user-defined function definition's own '=' is unaffected (not treated as a trailing marker)", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("f(x) = 2*x");
		expect(String(value.value)).toMatch(/defined/i);
	});
});
