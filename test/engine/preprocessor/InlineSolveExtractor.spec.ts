import { describe, expect, test } from "@jest/globals";
import { sharedInlineSolveExtractor } from "@/engine/preprocessor";

describe("InlineSolveExtractor", () => {
	test("extracts single inline expression", () => {
		const result = sharedInlineSolveExtractor.extract("s`1 + 2`");
		expect(result.expressions).toEqual(["1 + 2"]);
		expect(result.indices).toEqual([0]);
	});

	test("extracts multiple inline expressions", () => {
		const result = sharedInlineSolveExtractor.extract("s`1+2` and s`3*4`");
		expect(result.expressions).toEqual(["1+2", "3*4"]);
	});

	test("detects presence of inline solve", () => {
		expect(sharedInlineSolveExtractor.hasInlineSolve("s`1+2`")).toBe(true);
		expect(sharedInlineSolveExtractor.hasInlineSolve("1 + 2")).toBe(false);
	});

	test("returns empty for no matches", () => {
		const result = sharedInlineSolveExtractor.extract("plain text");
		expect(result.expressions).toEqual([]);
		expect(result.indices).toEqual([]);
	});
});