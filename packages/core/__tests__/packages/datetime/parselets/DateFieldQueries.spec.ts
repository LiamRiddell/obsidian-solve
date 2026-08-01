import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

/**
 * The natural-question date grammar: `what day is it in 30 days`, the
 * `month`/`week` equivalents, `<date> as weekday`, `<unit> between <a> and
 * <b>`, and the `is a weekend`/`is a workday` predicates.
 *
 * Every assertion uses a FIXED date literal rather than `now`, so results
 * are stable — the one exception is the bare "what day is it" form, which
 * is inherently relative and is therefore only checked against the same
 * value the already-shipped `weekday on now` produces.
 *
 * 25/12/2026 is a Friday and 26/12/2026 a Saturday (DD/MM/YYYY — see
 * DateLiteralNormalizerRule); those two anchor most of the cases below.
 */
function evaluate(expression: string) {
	return new ExpressionEngine("en", false).evaluateExpression(expression)[0];
}

describe("date field questions", () => {
	describe("weekday", () => {
		test.each([
			["what day is it on 25/12/2026", "Friday"],
			["what day will it be on 26/12/2026", "Saturday"],
			["what day is it on next friday", "Friday"],
			// The original phrasings must keep working unchanged.
			["weekday on 25/12/2026", "Friday"],
			["day of the week on 25/12/2026", "Friday"],
		])("%s -> %s", (expression, expected) => {
			expect(evaluate(expression).value).toBe(expected);
		});

		test("the bare form answers for today", () => {
			expect(evaluate("what day is it").value).toBe(evaluate("weekday on now").value);
		});

		test("`in <duration>` is the weekday of now + duration", () => {
			expect(evaluate("what day is it in 30 days").value).toBe(evaluate("weekday on now + 30 days").value);
			expect(evaluate("what day will it be in 2 weeks").value).toBe(evaluate("weekday on now").value);
		});

		test("a negative duration reaches backwards (there is no `ago` keyword)", () => {
			expect(evaluate("what day is it in -1 days").value).toBe(evaluate("weekday on yesterday").value);
		});
	});

	describe("month and week", () => {
		test.each([
			["what month is it on 25/12/2026", "December"],
			["month of 25/12/2026", "December"],
		])("%s -> %s", (expression, expected) => {
			expect(evaluate(expression).value).toBe(expected);
		});

		test("ISO week numbers", () => {
			// 1 Jan 2026 is a Thursday, so it belongs to week 1 of 2026 — the
			// case a naive day-of-year/7 gets wrong.
			expect(evaluate("week of 2026-01-01").toNumber()).toBe(1);
			expect(evaluate("what week is it on 25/12/2026").toNumber()).toBe(52);
		});

		test("the bare forms answer for today", () => {
			expect(evaluate("what month is it").value).toBe(evaluate("month of now").value);
			expect(evaluate("what week is it").toNumber()).toBe(evaluate("week of now").toNumber());
		});
	});

	describe("as-converters", () => {
		test.each([
			["25/12/2026 as weekday", "Friday"],
			["25/12/2026 as month", "December"],
		])("%s -> %s", (expression, expected) => {
			expect(evaluate(expression).value).toBe(expected);
		});

		test("as week", () => {
			expect(evaluate("25/12/2026 as week").toNumber()).toBe(52);
		});

		test("composes after a whole expression, which the question forms cannot", () => {
			expect(evaluate("25/12/2026 + 1 day as weekday").value).toBe("Saturday");
		});

		test("a non-date is an error, not a wrong answer", () => {
			// Reads a duration's raw milliseconds as an epoch if unguarded.
			const result = evaluate("90 days as week");
			expect(result.type).toBe(ValueType.Error);
		});
	});

	describe("<unit> between <date> and <date>", () => {
		test("counts the span in the requested unit", () => {
			expect(evaluate("days between 2026-01-01 and 2026-01-31").toNumber()).toBeCloseTo(30, 5);
			expect(evaluate("weeks between 2026-01-01 and 2026-01-15").toNumber()).toBeCloseTo(2, 5);
		});

		test("is unsigned — order of the endpoints does not matter", () => {
			expect(evaluate("days between 2026-01-31 and 2026-01-01").toNumber()).toBeCloseTo(30, 5);
		});

		test("accepts a leading `how many`, for between and for until", () => {
			expect(evaluate("how many days between 2026-01-01 and 2026-01-31").toNumber()).toBeCloseTo(30, 5);
			expect(evaluate("how many days until 2026-01-01").toNumber()).toBeCloseTo(
				evaluate("days until 2026-01-01").toNumber(),
				5,
			);
		});
	});

	describe("day-type predicates", () => {
		test.each([
			["25/12/2026 is a weekend", false],
			["26/12/2026 is a weekend", true],
			["25/12/2026 is a workday", true],
			["26/12/2026 is a workday", false],
			["26/12/2026 is a weekday", false],
			["25/12/2026 is a business day", true],
		])("%s -> %s", (expression, expected) => {
			expect(evaluate(expression).value).toBe(expected);
		});

		test("composes with date arithmetic", () => {
			expect(evaluate("25/12/2026 + 1 day is a weekend").value).toBe(true);
		});
	});

	describe("regression guards — the new keywords must not shadow anything", () => {
		test("`and` is still addition", () => {
			expect(evaluate("1 and 2").toNumber()).toBe(3);
		});

		test("`between ... and` still works for clamp", () => {
			expect(evaluate("clamp 15 between 0 and 10").toNumber()).toBe(10);
		});

		test("day/week/month are still usable as variable names", () => {
			const engine = new ExpressionEngine("en", false);
			expect(engine.evaluateExpression(":day = 5")[0].toNumber()).toBe(5);
			expect(engine.evaluateExpression(":week = 3")[0].toNumber()).toBe(3);
			expect(engine.evaluateExpression(":day + :week")[0].toNumber()).toBe(8);
		});

		test("`in <unit>` is still a unit conversion, not a date question", () => {
			expect(evaluate("90 days in weeks").toNumber()).toBeCloseTo(12.857, 2);
		});

		test("workday arithmetic and counting are untouched", () => {
			expect(evaluate("workdays in 3 weeks").toNumber()).toBe(15);
		});
	});
});
