import { ArithmeticExpression } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";
import { describe, expect, test } from "@jest/globals";

describe("English", () => {
	test("127.000 Should be 127", () => {
		const result = ArithmeticExpression.visitNumber("127.000", ".");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127);
	});

	test("127,000 Should be 127 thousand", () => {
		const result = ArithmeticExpression.visitNumber("127,000", ".");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000);
	});

	test("127,000.50 Should be 127 thousand point 50", () => {
		const result = ArithmeticExpression.visitNumber("127,000.50", ".");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000.5);
	});
});

describe("Non-English", () => {
	test("127,000 Should be 127", () => {
		const result = ArithmeticExpression.visitNumber("127,000", ",");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127);
	});

	test("127.000 Should be 127 thousand", () => {
		const result = ArithmeticExpression.visitNumber("127.000", ",");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000);
	});

	test("127.000,50 Should be 127 thousand point 50", () => {
		const result = ArithmeticExpression.visitNumber("127,000.50", ".");
		expect(result).toBeDefined();
		expect(result.value).toBeDefined();
		expect(result.value).toEqual(127_000.5);
	});
});
