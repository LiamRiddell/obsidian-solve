/**
 * `ms`-unit duration display — clock-style `H:MM`/`H:MM:SS` instead of a
 * raw millisecond count. `ms` is never a user-typeable unit (not in
 * `lexer/units.ts`); it's only ever produced by subtracting two clock
 * times/datetimes (`VM.ts`'s Datetime SUB case), so this is a narrow,
 * safe special case — see GitHub issue #45 ("calculate with durations").
 */
import { describe, expect, test } from "@jest/globals";
import { formatValue } from "@solve-js/format/FormatEngine";
import { uomValue } from "@solve-js/vm/Value";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";

describe("FormatEngine — ms-unit duration formatting", () => {
	test("whole hours format as H:MM", () => {
		expect(formatValue(uomValue(3_600_000, "ms"))).toBe("= 1:00");
	});

	test("hours + minutes format as H:MM", () => {
		expect(formatValue(uomValue(25_500_000, "ms"))).toBe("= 7:05");
	});

	test("a non-zero seconds component is shown as H:MM:SS", () => {
		expect(formatValue(uomValue(3_665_000, "ms"))).toBe("= 1:01:05");
	});

	test("negative durations keep the sign", () => {
		expect(formatValue(uomValue(-3_600_000, "ms"))).toBe("= -1:00");
	});

	test("zero is 0:00", () => {
		expect(formatValue(uomValue(0, "ms"))).toBe("= 0:00");
	});

	test("other time-span units (hours) are unaffected — still plain 'N unit'", () => {
		expect(formatValue(uomValue(2, "hours"))).toBe("= 2 hours");
	});
});

describe("real engine — clock-time subtraction now displays as a duration, not raw ms", () => {
	test("9:30 - 8:30 displays as '= 1:00'", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("9:30 - 8:30");
		expect(formatValue(value)).toBe("= 1:00");
	});

	test("a timesheet: subtract each clock-in/out pair, then sum with 'total above'", () => {
		const engine = new ExpressionEngine();
		const doc = new DocumentModel();
		const lines = ["9:30 - 8:30", "12:00 - 11:00", "18:00 - 12:55", "total above"];
		doc.setDocument(lines.join("\n"));
		new ThreeTierEvaluator(doc, engine).evaluate({ startLine: 1, endLine: lines.length });
		expect(formatValue(doc.getLineAt(4)!.result!)).toBe("= 7:05");
	});
});
