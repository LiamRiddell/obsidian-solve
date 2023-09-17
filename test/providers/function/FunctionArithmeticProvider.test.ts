import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { FloatResult } from "@/results/FloatResult";
import { beforeAll, describe, expect, test } from "@jest/globals";
import { expectProviderResultAndType } from "../../../test/helpers/Provider";

let provider: FunctionArithmeticProvider;

beforeAll(() => {
	provider = new FunctionArithmeticProvider();
});

describe("Functions", () => {
	test("sinh(1.0) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"sinh(1.0)",
			new FloatResult(Math.sinh(1.0))
		);
	});

	test("sin(1.0) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"sin(1.0)",
			new FloatResult(Math.sin(1.0))
		);
	});

	test("abs(-1200) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"abs(-1200)",
			new FloatResult(Math.abs(-1200))
		);
	});

	test("acosh(2.0) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"acosh(2.0)",
			new FloatResult(Math.acosh(2.0))
		);
	});

	test("asinh(1.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"asinh(1.5)",
			new FloatResult(Math.asinh(1.5))
		);
	});

	test("asin(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"asin(0.5)",
			new FloatResult(Math.asin(0.5))
		);
	});

	test("atan2(1.0, 2.0) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"atan2(1.0, 2.0)",
			new FloatResult(Math.atan2(1.0, 2.0))
		);
	});

	test("atanh(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"atanh(0.5)",
			new FloatResult(Math.atanh(0.5))
		);
	});

	test("atan(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"atan(0.5)",
			new FloatResult(Math.atan(0.5))
		);
	});

	test("cbrt(8) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"cbrt(8)",
			new FloatResult(Math.cbrt(8))
		);
	});

	test("ceil(3.3) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"ceil(3.3)",
			new FloatResult(Math.ceil(3.3))
		);
	});

	test("clz32(42) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"clz32(42)",
			new FloatResult(Math.clz32(42))
		);
	});

	test("cosh(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"cosh(0.5)",
			new FloatResult(Math.cosh(0.5))
		);
	});

	test("cos(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"cos(0.5)",
			new FloatResult(Math.cos(0.5))
		);
	});

	test("expm1(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"expm1(0.5)",
			new FloatResult(Math.expm1(0.5))
		);
	});

	test("exp(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"exp(0.5)",
			new FloatResult(Math.exp(0.5))
		);
	});

	test("floor(3.7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"floor(3.7)",
			new FloatResult(Math.floor(3.7))
		);
	});

	test("fround(3.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"fround(3.5)",
			new FloatResult(Math.fround(3.5))
		);
	});

	test("hypot(3, 4) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"hypot(3, 4)",
			new FloatResult(Math.hypot(3, 4))
		);
	});

	test("imul(2, 7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"imul(2, 7)",
			new FloatResult(Math.imul(2, 7))
		);
	});

	test("log10(100) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"log10(100)",
			new FloatResult(Math.log10(100))
		);
	});

	test("log1p(1.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"log1p(1.5)",
			new FloatResult(Math.log1p(1.5))
		);
	});

	test("log2(8) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"log2(8)",
			new FloatResult(Math.log2(8))
		);
	});

	test("log(10) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"log(10)",
			new FloatResult(Math.log(10))
		);
	});

	test("max(4, 7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"max(4, 7)",
			new FloatResult(Math.max(4, 7))
		);
	});

	test("min(4, 7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"min(4, 7)",
			new FloatResult(Math.min(4, 7))
		);
	});

	test("pow(2, 3) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"pow(2, 3)",
			new FloatResult(Math.pow(2, 3))
		);
	});

	test("random() to be a number", () => {
		const result = provider.provide("random()") as FloatResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(FloatResult);

		// @ts-ignore
		expect(result?.value).toBeLessThan(1);

		// @ts-ignore
		expect(result?.value).toBeGreaterThanOrEqual(0);
	});

	test("round(3.7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"round(3.7)",
			new FloatResult(Math.round(3.7))
		);
	});

	test("sign(-5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"sign(-5)",
			new FloatResult(Math.sign(-5))
		);
	});

	test("sqrt(16) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"sqrt(16)",
			new FloatResult(Math.sqrt(16))
		);
	});

	test("tanh(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"tanh(0.5)",
			new FloatResult(Math.tanh(0.5))
		);
	});

	test("tan(0.5) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"tan(0.5)",
			new FloatResult(Math.tan(0.5))
		);
	});

	test("trunc(3.7) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"trunc(3.7)",
			new FloatResult(Math.trunc(3.7))
		);
	});
});

describe("Mixed", () => {
	test("sin(0.42) + acos(0.52) ", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"sin(0.42) + acos(0.52)",
			new FloatResult(Math.sin(0.42) + Math.acos(0.52))
		);
	});
});
