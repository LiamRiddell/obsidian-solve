import { describe, expect, test } from "@jest/globals";
import { stripQuotes } from "@solve-js/utilities/Strings";

describe("stripQuotes", () => {
	test("strips matching double quotes", () => {
		expect(stripQuotes('"Iron Axe"')).toBe("Iron Axe");
	});

	test("returns the input unchanged when not quoted", () => {
		expect(stripQuotes("Iron Axe")).toBe("Iron Axe");
	});

	test("returns the input unchanged when only the start is quoted", () => {
		expect(stripQuotes('"Iron Axe')).toBe('"Iron Axe');
	});

	test("returns the input unchanged when only the end is quoted", () => {
		expect(stripQuotes('Iron Axe"')).toBe('Iron Axe"');
	});

	test("handles an empty quoted string", () => {
		expect(stripQuotes('""')).toBe("");
	});

	test("returns a lone quote character unchanged", () => {
		expect(stripQuotes('"')).toBe('"');
	});

	test("returns an empty string unchanged", () => {
		expect(stripQuotes("")).toBe("");
	});
});
