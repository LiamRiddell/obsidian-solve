import { FunctionArithmeticProvider } from "@/providers/arithmetic/function/FunctionArithmeticProvider";
import { beforeAll, describe, expect, test } from "@jest/globals";

let functionArithmeticProvider: FunctionArithmeticProvider;

beforeAll(() => {
	functionArithmeticProvider = new FunctionArithmeticProvider();
});

describe("Functions", () => {
	test("sinh(1.0) to equal 1.175", () => {
		const result = functionArithmeticProvider.provide("sinh(1.0)");

		expect(result).toBeDefined();

		expect(result).toBe("1.175");
	});

	test("sin(1.0) to equal 0.8415", () => {
		const result = functionArithmeticProvider.provide("sin(1.0)");

		expect(result).toBeDefined();

		expect(result).toBe("0.8415");
	});

	test("abs(-1200) to equal 1200", () => {
		const result = functionArithmeticProvider.provide("abs(-1200)");

		expect(result).toBeDefined();

		expect(result).toBe("1200");
	});

	test("acosh(2.0) to equal 1.317", () => {
		const result = functionArithmeticProvider.provide("acosh(2.0)");

		expect(result).toBeDefined();

		expect(result).toBe("1.317");
	});

	test("asinh(1.5) to equal 1.194", () => {
		const result = functionArithmeticProvider.provide("asinh(1.5)");

		expect(result).toBeDefined();
		expect(result).toBe("1.195");
	});

	test("asin(0.5) to equal 0.5236", () => {
		const result = functionArithmeticProvider.provide("asin(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.5236");
	});

	test("atan2(1.0, 2.0) to equal 0.4636", () => {
		const result = functionArithmeticProvider.provide("atan2(1.0, 2.0)");

		expect(result).toBeDefined();
		expect(result).toBe("0.4636");
	});

	test("atanh(0.5) to equal 0.5493", () => {
		const result = functionArithmeticProvider.provide("atanh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.5493");
	});

	test("atan(0.5) to equal 0.4636", () => {
		const result = functionArithmeticProvider.provide("atan(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.4636");
	});

	test("cbrt(8) to equal 2.000", () => {
		const result = functionArithmeticProvider.provide("cbrt(8)");

		expect(result).toBeDefined();
		expect(result).toBe("2.000");
	});

	test("ceil(3.3) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("ceil(3.3)");

		expect(result).toBeDefined();
		expect(result).toBe("4.000");
	});

	test("clz32(42) to equal 26.00", () => {
		const result = functionArithmeticProvider.provide("clz32(42)");

		expect(result).toBeDefined();
		expect(result).toBe("26.00");
	});

	test("cosh(0.5) to equal 1.128", () => {
		const result = functionArithmeticProvider.provide("cosh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("1.128");
	});

	test("cos(0.5) to equal 0.8776", () => {
		const result = functionArithmeticProvider.provide("cos(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.8776");
	});

	test("expm1(0.5) to equal 0.6487", () => {
		const result = functionArithmeticProvider.provide("expm1(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.6487");
	});

	test("exp(0.5) to equal 1.649", () => {
		const result = functionArithmeticProvider.provide("exp(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("1.649");
	});

	test("floor(3.7) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("floor(3.7)");

		expect(result).toBeDefined();
		expect(result).toBe("3.000");
	});

	test("fround(3.5) to equal 3.500", () => {
		const result = functionArithmeticProvider.provide("fround(3.5)");

		expect(result).toBeDefined();
		expect(result).toBe("3.500");
	});

	test("hypot(3, 4) to equal 5.000", () => {
		const result = functionArithmeticProvider.provide("hypot(3, 4)");

		expect(result).toBeDefined();
		expect(result).toBe("5.000");
	});

	test("imul(2, 7) to equal 14.00", () => {
		const result = functionArithmeticProvider.provide("imul(2, 7)");

		expect(result).toBeDefined();
		expect(result).toBe("14.00");
	});

	test("log10(100) to equal 2.000", () => {
		const result = functionArithmeticProvider.provide("log10(100)");

		expect(result).toBeDefined();
		expect(result).toBe("2.000");
	});

	test("log1p(1.5) to equal 0.9163", () => {
		const result = functionArithmeticProvider.provide("log1p(1.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.9163");
	});

	test("log2(8) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("log2(8)");

		expect(result).toBeDefined();
		expect(result).toBe("3.000");
	});

	test("log(10) to equal 2.303", () => {
		const result = functionArithmeticProvider.provide("log(10)");

		expect(result).toBeDefined();
		expect(result).toBe("2.303");
	});

	test("max(4, 7) to equal 7.000", () => {
		const result = functionArithmeticProvider.provide("max(4, 7)");

		expect(result).toBeDefined();
		expect(result).toBe("7.000");
	});

	test("min(4, 7) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("min(4, 7)");

		expect(result).toBeDefined();
		expect(result).toBe("4.000");
	});

	test("pow(2, 3) to equal 8.000", () => {
		const result = functionArithmeticProvider.provide("pow(2, 3)");

		expect(result).toBeDefined();
		expect(result).toBe("8.000");
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
		expect(result).toBe("4.000");
	});

	test("sign(-5) to equal -1.000", () => {
		const result = functionArithmeticProvider.provide("sign(-5)");

		expect(result).toBeDefined();
		expect(result).toBe("-1.000");
	});

	test("sqrt(16) to equal 4.000", () => {
		const result = functionArithmeticProvider.provide("sqrt(16)");

		expect(result).toBeDefined();
		expect(result).toBe("4.000");
	});

	test("tanh(0.5) to equal 0.4621", () => {
		const result = functionArithmeticProvider.provide("tanh(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.4621");
	});

	test("tan(0.5) to equal 0.5463", () => {
		const result = functionArithmeticProvider.provide("tan(0.5)");

		expect(result).toBeDefined();
		expect(result).toBe("0.5463");
	});

	test("trunc(3.7) to equal 3.000", () => {
		const result = functionArithmeticProvider.provide("trunc(3.7)");

		expect(result).toBeDefined();
		expect(result).toBe("3.000");
	});
});

describe("Mixed", () => {
	test("sin(0.42) + acos(0.52) to equal 1.432", () => {
		const result = functionArithmeticProvider.provide(
			"sin(0.42) + acos(0.52)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("1.432");
	});
});
