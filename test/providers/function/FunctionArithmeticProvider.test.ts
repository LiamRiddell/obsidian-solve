import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { NumberResult } from "@/results/AutoNumberResult";
import { beforeAll, describe, expect, test } from "@jest/globals";
import { expectProviderResultAndType } from "../../../test/helpers/Provider";

let provider: FunctionArithmeticProvider;

beforeAll(() => {
	provider = new FunctionArithmeticProvider();
});

describe("Functions", () => {
	test("sinh(1.0)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"sinh(1.0)",
			new NumberResult(Math.sinh(1.0))
		);
	});

	test("sin(1.0)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"sin(1.0)",
			new NumberResult(Math.sin(1.0))
		);
	});

	test("abs(-1200)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"abs(-1200)",
			new NumberResult(Math.abs(-1200))
		);
	});

	test("acosh(2.0)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"acosh(2.0)",
			new NumberResult(Math.acosh(2.0))
		);
	});

	test("asinh(1.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"asinh(1.5)",
			new NumberResult(Math.asinh(1.5))
		);
	});

	test("asin(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"asin(0.5)",
			new NumberResult(Math.asin(0.5))
		);
	});

	test("atan2(1.0, 2.0)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"atan2(1.0, 2.0)",
			new NumberResult(Math.atan2(1.0, 2.0))
		);
	});

	test("atanh(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"atanh(0.5)",
			new NumberResult(Math.atanh(0.5))
		);
	});

	test("atan(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"atan(0.5)",
			new NumberResult(Math.atan(0.5))
		);
	});

	test("cbrt(8)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"cbrt(8)",
			new NumberResult(Math.cbrt(8))
		);
	});

	test("ceil(3.3)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"ceil(3.3)",
			new NumberResult(Math.ceil(3.3))
		);
	});

	test("clz32(42)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"clz32(42)",
			new NumberResult(Math.clz32(42))
		);
	});

	test("cosh(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"cosh(0.5)",
			new NumberResult(Math.cosh(0.5))
		);
	});

	test("cos(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"cos(0.5)",
			new NumberResult(Math.cos(0.5))
		);
	});

	test("expm1(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"expm1(0.5)",
			new NumberResult(Math.expm1(0.5))
		);
	});

	test("exp(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"exp(0.5)",
			new NumberResult(Math.exp(0.5))
		);
	});

	test("floor(3.7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"floor(3.7)",
			new NumberResult(Math.floor(3.7))
		);
	});

	test("fround(3.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"fround(3.5)",
			new NumberResult(Math.fround(3.5))
		);
	});

	test("hypot(3, 4)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"hypot(3, 4)",
			new NumberResult(Math.hypot(3, 4))
		);
	});

	test("imul(2, 7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"imul(2, 7)",
			new NumberResult(Math.imul(2, 7))
		);
	});

	test("log10(100)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"log10(100)",
			new NumberResult(Math.log10(100))
		);
	});

	test("log1p(1.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"log1p(1.5)",
			new NumberResult(Math.log1p(1.5))
		);
	});

	test("log2(8)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"log2(8)",
			new NumberResult(Math.log2(8))
		);
	});

	test("log(10)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"log(10)",
			new NumberResult(Math.log(10))
		);
	});

	test("max(4, 7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"max(4, 7)",
			new NumberResult(Math.max(4, 7))
		);
	});

	test("min(4, 7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"min(4, 7)",
			new NumberResult(Math.min(4, 7))
		);
	});

	test("pow(2, 3)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"pow(2, 3)",
			new NumberResult(Math.pow(2, 3))
		);
	});

	test("random() to be a number", () => {
		const result = provider.provide("random()") as NumberResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(NumberResult);

		// @ts-ignore
		expect(result?.value).toBeLessThan(1);

		// @ts-ignore
		expect(result?.value).toBeGreaterThanOrEqual(0);
	});

	test("round(3.7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"round(3.7)",
			new NumberResult(Math.round(3.7))
		);
	});

	test("sign(-5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"sign(-5)",
			new NumberResult(Math.sign(-5))
		);
	});

	test("sqrt(16)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"sqrt(16)",
			new NumberResult(Math.sqrt(16))
		);
	});

	test("tanh(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"tanh(0.5)",
			new NumberResult(Math.tanh(0.5))
		);
	});

	test("tan(0.5)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"tan(0.5)",
			new NumberResult(Math.tan(0.5))
		);
	});

	test("trunc(3.7)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"trunc(3.7)",
			new NumberResult(Math.trunc(3.7))
		);
	});
});

describe("Mixed", () => {
	test("sin(0.42) + acos(0.52)", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"sin(0.42) + acos(0.52)",
			new NumberResult(Math.sin(0.42) + Math.acos(0.52))
		);
	});
});
