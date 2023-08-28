import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { beforeAll, describe, expect, test } from "@jest/globals";

let functionArithmeticProvider: FunctionArithmeticProvider;

beforeAll(() => {
	functionArithmeticProvider = new FunctionArithmeticProvider();
});

describe("Functions", () => {
	test("sinh(1.0) to equal 1.175", () => {
		const result = functionArithmeticProvider.provide("sinh(1.0)");

		expect(result).toBeDefined();

		expect(result).toBe(Math.sinh(1.0));
	});

	test("sin(1.0) to equal 0.8415", () => {
		const result = functionArithmeticProvider.provide("sin(1.0)");

		expect(result).toBeDefined();

		expect(result).toBe(Math.sin(1.0));
	});

	test("abs(-1200) to equal 1200", () => {
		const result = functionArithmeticProvider.provide("abs(-1200)");

		expect(result).toBeDefined();

		expect(result).toBe(Math.abs(-1200));
	});

	test("acosh(2.0) to equal 1.317", () => {
		const result = functionArithmeticProvider.provide("acosh(2.0)");

		expect(result).toBeDefined();

		expect(result).toBe(Math.acosh(2.0));
	});

	test("asinh(1.5) to equal 1.194", () => {
		const result = functionArithmeticProvider.provide("asinh(1.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.asinh(1.5));
	});

	test("asin(0.5) to equal 0.5236", () => {
		const result = functionArithmeticProvider.provide("asin(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.asin(0.5));
	});

	test("atan2(1.0, 2.0) to equal 0.4636", () => {
		const result = functionArithmeticProvider.provide("atan2(1.0, 2.0)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.atan2(1.0, 2.0));
	});

	test("atanh(0.5) to equal 0.5493", () => {
		const result = functionArithmeticProvider.provide("atanh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.atanh(0.5));
	});

	test("atan(0.5) to equal 0.4636", () => {
		const result = functionArithmeticProvider.provide("atan(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.atan(0.5));
	});

	test("cbrt(8) to equal 2.000", () => {
		const result = functionArithmeticProvider.provide("cbrt(8)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.cbrt(8));
	});

	test("ceil(3.3) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("ceil(3.3)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.ceil(3.3));
	});

	test("clz32(42) to equal 26.00", () => {
		const result = functionArithmeticProvider.provide("clz32(42)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.clz32(42));
	});

	test("cosh(0.5) to equal 1.128", () => {
		const result = functionArithmeticProvider.provide("cosh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.cosh(0.5));
	});

	test("cos(0.5) to equal 0.8776", () => {
		const result = functionArithmeticProvider.provide("cos(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.cos(0.5));
	});

	test("expm1(0.5) to equal 0.6487", () => {
		const result = functionArithmeticProvider.provide("expm1(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.expm1(0.5));
	});

	test("exp(0.5) to equal 1.649", () => {
		const result = functionArithmeticProvider.provide("exp(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.exp(0.5));
	});

	test("floor(3.7) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("floor(3.7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.floor(3.7));
	});

	test("fround(3.5) to equal 3.500", () => {
		const result = functionArithmeticProvider.provide("fround(3.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.fround(3.5));
	});

	test("hypot(3, 4) to equal 5.000", () => {
		const result = functionArithmeticProvider.provide("hypot(3, 4)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.hypot(3, 4));
	});

	test("imul(2, 7) to equal 14.00", () => {
		const result = functionArithmeticProvider.provide("imul(2, 7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.imul(2, 7));
	});

	test("log10(100) to equal 2.000", () => {
		const result = functionArithmeticProvider.provide("log10(100)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.log10(100));
	});

	test("log1p(1.5) to equal 0.9163", () => {
		const result = functionArithmeticProvider.provide("log1p(1.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.log1p(1.5));
	});

	test("log2(8) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("log2(8)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.log2(8));
	});

	test("log(10) to equal 2.303", () => {
		const result = functionArithmeticProvider.provide("log(10)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.log(10));
	});

	test("max(4, 7) to equal 7.000", () => {
		const result = functionArithmeticProvider.provide("max(4, 7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.max(4, 7));
	});

	test("min(4, 7) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("min(4, 7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.min(4, 7));
	});

	test("pow(2, 3) to equal 8.000", () => {
		const result = functionArithmeticProvider.provide("pow(2, 3)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.pow(2, 3));
	});

	test("random() to be a number", () => {
		const result = functionArithmeticProvider.provide("random()");

		expect(result).toBeDefined();

		// @ts-ignore
		expect(parseFloat(result)).toBeLessThan(1);

		// @ts-ignore
		expect(parseFloat(result)).toBeGreaterThanOrEqual(0);
	});

	test("round(3.7) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("round(3.7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.round(3.7));
	});

	test("sign(-5) to equal -1.000", () => {
		const result = functionArithmeticProvider.provide("sign(-5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.sign(-5));
	});

	test("sqrt(16) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("sqrt(16)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.sqrt(16));
	});

	test("tanh(0.5) to equal 0.4621", () => {
		const result = functionArithmeticProvider.provide("tanh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.tanh(0.5));
	});

	test("tan(0.5) to equal 0.5463", () => {
		const result = functionArithmeticProvider.provide("tan(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.tan(0.5));
	});

	test("trunc(3.7) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("trunc(3.7)");

		expect(result).toBeDefined();
		expect(result).toBe(Math.trunc(3.7));
	});
});

describe("Mixed", () => {
	test("sin(0.42) + acos(0.52) to equal 1.432", () => {
		const result = functionArithmeticProvider.provide(
			"sin(0.42) + acos(0.52)"
		);

		expect(result).toBeDefined();

		expect(result).toBe(Math.sin(0.42) + Math.acos(0.52));
	});
});
