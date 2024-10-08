import { ArithmeticExpression } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";
import { describe, expect, test } from "@jest/globals";

const ENGLISH_SEPERATOR_LOCALE = "en-US";
const NON_ENGLISH_SEPERATOR_LOCALE = "de-DE";

describe("English", () => {
	test("127.000 Should be 127", () => {
		const result = ArithmeticExpression.visitNumber(
			"127.000",
			ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127);
	});

	test("12.2 Should be 12.2", () => {
		const result = ArithmeticExpression.visitNumber(
			"12.2",
			ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toBeCloseTo(12.2);
	});

	test("127,000 Should be 127 thousand", () => {
		const result = ArithmeticExpression.visitNumber(
			"127,000",
			ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000);
	});

	test("127,000.50 Should be 127 thousand point 50", () => {
		const result = ArithmeticExpression.visitNumber(
			"127,000.50",
			ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000.5);
	});
});

describe("Non-English", () => {
	test("127,000 Should be 127", () => {
		const result = ArithmeticExpression.visitNumber(
			"127,000",
			NON_ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127);
	});

	test("12,2 Should be 12.2", () => {
		const result = ArithmeticExpression.visitNumber(
			"12,2",
			NON_ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toBeCloseTo(12.2);
	});

	test("127.000 Should be 127 thousand", () => {
		const result = ArithmeticExpression.visitNumber(
			"127.000",
			NON_ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000);
	});

	test("127.000,50 Should be 127 thousand point 50", () => {
		const result = ArithmeticExpression.visitNumber(
			"127.000,50",
			NON_ENGLISH_SEPERATOR_LOCALE
		);
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toBeCloseTo(127_000.5);
	});
});
