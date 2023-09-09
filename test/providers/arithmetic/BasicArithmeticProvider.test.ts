import { BasicArithmeticProvider } from "@/providers/arithmetic/BasicArithmeticProvider";
import { beforeAll, describe, expect, test } from "@jest/globals";

let basicArithmeticProvider: BasicArithmeticProvider;

beforeAll(() => {
	basicArithmeticProvider = new BasicArithmeticProvider();
});

describe("Primitive", () => {
	test("whole number", () => {
		const result = basicArithmeticProvider.provide("102");

		expect(result).toBeDefined();

		expect(result).toBe(102);
	});

	test("positive whole number", () => {
		const result = basicArithmeticProvider.provide("+10");

		expect(result).toBeDefined();

		expect(result).toBe(10);
	});

	test("negative whole number", () => {
		const result = basicArithmeticProvider.provide("-10");

		expect(result).toBeDefined();

		expect(result).toBe(-10);
	});

	test("fractional number", () => {
		const result = basicArithmeticProvider.provide("10.2");

		expect(result).toBeDefined();

		expect(result).toBe(10.2);
	});

	test("positive fractional number", () => {
		const result = basicArithmeticProvider.provide("+7.1");

		expect(result).toBeDefined();

		expect(result).toBe(7.1);
	});

	test("negative fractional number", () => {
		const result = basicArithmeticProvider.provide("-5.1");

		expect(result).toBeDefined();

		expect(result).toBe(-5.1);
	});

	test("hex", () => {
		const result = basicArithmeticProvider.provide("0x10");

		expect(result).toBeDefined();

		expect(result).toBe(0x10);
	});
});

describe("Addition", () => {
	test("100 + 2 to equal 102", () => {
		const result = basicArithmeticProvider.provide("100 + 2");

		expect(result).toBeDefined();

		expect(result).toBe(102);
	});

	test("100 add 2 to equal 102", () => {
		const result = basicArithmeticProvider.provide("100 add 2");

		expect(result).toBeDefined();

		expect(result).toBe(102);
	});

	test("100 plus 2 to equal 102", () => {
		const result = basicArithmeticProvider.provide("100 plus 2");

		expect(result).toBeDefined();

		expect(result).toBe(102);
	});

	test("0x20 + 10 to equal 0x30", () => {
		const result = basicArithmeticProvider.provide("0x20 + 0x10");

		expect(result).toBeDefined();

		expect(result).toBe(0x30);
	});

	test("0x20 + 0xC to equal 0x2C", () => {
		const result = basicArithmeticProvider.provide("0x20 + 0xC");

		expect(result).toBeDefined();

		expect(result).toBe(0x2c);
	});
});

describe("Subtraction", () => {
	test("100 - 2 to equal 98", () => {
		const result = basicArithmeticProvider.provide("100 - 2");

		expect(result).toBeDefined();

		expect(result).toBe(98);
	});

	test("100 take 2 to equal 98", () => {
		const result = basicArithmeticProvider.provide("100 take 2");

		expect(result).toBeDefined();

		expect(result).toBe(98);
	});

	test("100 minus 2 to equal 98", () => {
		const result = basicArithmeticProvider.provide("100 minus 2");

		expect(result).toBeDefined();

		expect(result).toBe(98);
	});

	test("0x20 - 10 to equal 0x16", () => {
		const result = basicArithmeticProvider.provide("0x20 - 10");

		expect(result).toBeDefined();

		expect(result).toBe(0x16);
	});

	test("0x20 - 0xC to equal 0x14", () => {
		const result = basicArithmeticProvider.provide("0x20 - 0xC");

		expect(result).toBeDefined();

		expect(result).toBe(0x14);
	});

	test("0x100 - 0x328 to equal -0x228", () => {
		const result = basicArithmeticProvider.provide("0x100 - 0x328");

		expect(result).toBeDefined();

		expect(result).toBe(-0x228);
	});
});

describe("Multiplication", () => {
	test("100 * 2 to equal 200", () => {
		const result = basicArithmeticProvider.provide("100 * 2");

		expect(result).toBeDefined();

		expect(result).toBe(200);
	});

	test("100 times 2 to equal 200", () => {
		const result = basicArithmeticProvider.provide("100 times 2");

		expect(result).toBeDefined();

		expect(result).toBe(200);
	});

	test("100 multiply by 2 to equal 200", () => {
		const result = basicArithmeticProvider.provide("100 multiply by 2");

		expect(result).toBeDefined();

		expect(result).toBe(200);
	});

	test("100 multiply 2 to equal 200", () => {
		const result = basicArithmeticProvider.provide("100 multiply 2");

		expect(result).toBeDefined();

		expect(result).toBe(200);
	});

	test("0x20 * 10 to equal 0x140", () => {
		const result = basicArithmeticProvider.provide("0x20 * 10");

		expect(result).toBeDefined();

		expect(result).toBe(0x140);
	});

	test("0x20 * 0xC to equal 0x180", () => {
		const result = basicArithmeticProvider.provide("0x20 * 0xC");

		expect(result).toBeDefined();

		expect(result).toBe(0x180);
	});
});

describe("Division", () => {
	test("100 / 2 to equal 50", () => {
		const result = basicArithmeticProvider.provide("100 / 2");

		expect(result).toBeDefined();

		expect(result).toBe(50);
	});

	test("100 divide by 2 to equal 50", () => {
		const result = basicArithmeticProvider.provide("100 divide by 2");

		expect(result).toBeDefined();

		expect(result).toBe(50);
	});

	test("100 divide 2 to equal 50", () => {
		const result = basicArithmeticProvider.provide("100 divide 2");

		expect(result).toBeDefined();

		expect(result).toBe(50);
	});

	test("0x20 / 10 to equal 0x3", () => {
		const result = basicArithmeticProvider.provide("0x20 / 10");

		expect(result).toBeDefined();

		expect(result).toBe(0x3);
	});

	test("0x20 / 0xC to equal 0x2", () => {
		const result = basicArithmeticProvider.provide("0x20 / 0xC");

		expect(result).toBeDefined();

		expect(result).toBe(0x2);
	});
});

describe("Exponent", () => {
	test("10 ^ 2 to equal 100", () => {
		const result = basicArithmeticProvider.provide("10 ^ 2");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});

	test("10 to the power of 2 to equal 100", () => {
		const result = basicArithmeticProvider.provide("10 to the power of 2");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});

	test("10 power of 2 to equal 100", () => {
		const result = basicArithmeticProvider.provide("10 power of 2");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});

	test("10 exponent 2 to equal 100", () => {
		const result = basicArithmeticProvider.provide("10 exponent 2");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});

	test("10 prime 2 to equal 100", () => {
		const result = basicArithmeticProvider.provide("10 prime 2");

		expect(result).toBeDefined();

		expect(result).toBe(100);
	});
});

describe("PEMDAS", () => {
	test("(4 + 3) * 2^2 - 10 / 2 to equal 23", () => {
		const result = basicArithmeticProvider.provide(
			"(4 + 3) * 2^2 - 10 / 2"
		);

		expect(result).toBeDefined();

		expect(result).toBe(23);
	});

	test("(4 plus 3) times by 2 to the power of 2 minus 10 divide by 2 to equal 23", () => {
		const result = basicArithmeticProvider.provide(
			"(4 plus 3) times by 2 to the power of 2 minus 10 divide by 2"
		);

		expect(result).toBeDefined();

		expect(result).toBe(23);
	});
});
