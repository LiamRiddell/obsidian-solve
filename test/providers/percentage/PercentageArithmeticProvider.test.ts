import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { beforeAll, describe, expect, test } from "@jest/globals";

let percentageArithmeticProvider: PercentageArithmeticProvider;

beforeAll(() => {
	percentageArithmeticProvider = new PercentageArithmeticProvider();
});

describe("Primitive", () => {
	test("percentage", () => {
		const result = percentageArithmeticProvider.provide("10%");

		expect(result).toBeDefined();

		expect(result).toBe(10.0);
	});
});

describe("Addition", () => {
	test("10 + 15% to equal 11.5", () => {
		const result = percentageArithmeticProvider.provide("10 + 15%");

		expect(result).toBeDefined();

		expect(result).toBe(11.5);
	});

	test("15% + 10 to equal 10.15", () => {
		const result = percentageArithmeticProvider.provide("15% + 10");

		expect(result).toBeDefined();

		expect(result).toBe(10.15);
	});
});

describe("Subtraction", () => {
	test("10 - 15% to equal 8.50", () => {
		const result = percentageArithmeticProvider.provide("10 - 15%");

		expect(result).toBeDefined();

		expect(result).toBe(8.5);
	});

	test("15% - 10 to equal 9.85", () => {
		const result = percentageArithmeticProvider.provide("15% - 10");

		expect(result).toBeDefined();

		expect(result).toBe(-9.85);
	});
});

describe("Multiplication", () => {
	test("10 * 15% to equal 15.00", () => {
		const result = percentageArithmeticProvider.provide("10 * 15%");

		expect(result).toBeDefined();

		expect(result).toBe(15.0);
	});

	test("15% * 10 to equal 1.50", () => {
		const result = percentageArithmeticProvider.provide("15% * 10");

		expect(result).toBeDefined();

		expect(result).toBe(1.5);
	});
});

describe("Division", () => {
	test("10 / 10% to equal 10", () => {
		const result = percentageArithmeticProvider.provide("10 / 10%");

		expect(result).toBeDefined();

		expect(result).toBe(10);
	});

	test("100% / 10 to equal 0.10", () => {
		const result = percentageArithmeticProvider.provide("100% / 10");

		expect(result).toBeDefined();

		expect(result).toBe(0.1);
	});
});

describe("Exponent", () => {
	test("10 ^ 20% to equal 100", () => {
		const result = percentageArithmeticProvider.provide("10 ^ 20%");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});

	test("150% ^  10 to equal 100", () => {
		const result = percentageArithmeticProvider.provide("150% ^ 10");

		expect(result).toBeDefined();

		expect(result).toBe(57.6650390625);
	});
});

describe("PEMDAS", () => {
	test("(10 + 50%) * 2 to equal 30.00", () => {
		const result = percentageArithmeticProvider.provide("(10 + 50%) * 2");

		expect(result).toBeDefined();

		expect(result).toBe(30);
	});
});

describe("Percentage Of", () => {
	test("10% of 20 to equal 2", () => {
		const result = percentageArithmeticProvider.provide("10% of 20");

		expect(result).toBeDefined();

		expect(result).toBe(2);
	});
});

describe("Percentage Increase/Decrease", () => {
	test("800 to 1000 to equal 25%", () => {
		const result = percentageArithmeticProvider.provide("800 to 1000");

		expect(result).toBeDefined();

		expect(result).toBe(25);
	});

	test("800 to 400 to equal 25%", () => {
		const result = percentageArithmeticProvider.provide("800 to 400");

		expect(result).toBeDefined();

		expect(result).toBe(-50);
	});
});

describe("Increase/Decrease By Percentage", () => {
	test("increase 100 by 25% to equal 125", () => {
		const result = percentageArithmeticProvider.provide(
			"increase 100 by 25%"
		);

		expect(result).toBeDefined();

		expect(result).toBe(125);
	});

	test("decrease 100 by 25% to equal 75", () => {
		const result = percentageArithmeticProvider.provide(
			"decrease 100 by 25%"
		);

		expect(result).toBeDefined();

		expect(result).toBe(75);
	});
});
