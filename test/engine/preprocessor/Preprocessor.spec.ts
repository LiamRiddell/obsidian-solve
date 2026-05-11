import { describe, expect, test } from "@jest/globals";
import { sharedPreprocessor } from "@/engine/preprocessor";

describe("Preprocessor", () => {
	test("removes markdown list markers", () => {
		const result = sharedPreprocessor.process("- 1 + 2");
		expect(result.cleanedExpression).toBe("1 + 2");
	});

	test("removes blockquote markers", () => {
		const result = sharedPreprocessor.process("> 1 + 2");
		expect(result.cleanedExpression).toBe("1 + 2");
	});

	test("removes comments with #", () => {
		const result = sharedPreprocessor.process("1 + 2 # this is a comment");
		expect(result.cleanedExpression).toBe("1 + 2");
	});

	test("removes comments with //", () => {
		const result = sharedPreprocessor.process("1 + 2 // comment");
		expect(result.cleanedExpression).toBe("1 + 2");
	});

	test("extracts inline solve expressions from original text", () => {
		const result = sharedPreprocessor.process("s`1 + 2`");
		expect(result.hasInlineSolve).toBe(true);
		expect(result.inlineExpressions).toEqual(["1 + 2"]);
	});

	test("extracts multiple inline solve expressions", () => {
		const result = sharedPreprocessor.process("s`1 + 2` and s`3 * 4`");
		expect(result.hasInlineSolve).toBe(true);
		expect(result.inlineExpressions).toEqual(["1 + 2", "3 * 4"]);
	});

	test("preserves original line text", () => {
		const result = sharedPreprocessor.process("  1 + 2  ");
		expect(result.originalLineText).toBe("  1 + 2  ");
	});

	test("handles empty input", () => {
		const result = sharedPreprocessor.process("");
		expect(result.cleanedExpression).toBe("");
		expect(result.hasInlineSolve).toBe(false);
	});

	test("removes MathJax expressions", () => {
		const result = sharedPreprocessor.process("$$x^2$$");
		expect(result.cleanedExpression).toBe("");
	});
});