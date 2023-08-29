import { VectorArithmeticProvider } from "@/providers/vector/VectorArithmeticProvider";
import { beforeAll, describe, expect, test } from "@jest/globals";

let vectorArithmeticProvider: VectorArithmeticProvider;

beforeAll(() => {
	vectorArithmeticProvider = new VectorArithmeticProvider();
});

describe("Vector2", () => {
	test("vec2(1, 2) to equal (1.0, 2.0)", () => {
		const result = vectorArithmeticProvider.provide("vec2(1, 2)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0)");
	});

	test("(1, 2) to equal (1.0, 2.0)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0)");
	});

	test("(1, 2) + (10, 12) to equal (11, 14)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2) + (10, 12)");

		expect(result).toBeDefined();

		expect(result).toBe("(11, 14)");
	});

	test("(1, 2) - (10, 12) to equal (-9, -10)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2) - (10, 12)");

		expect(result).toBeDefined();

		expect(result).toBe("(-9.0, -10)");
	});

	test("(1, 2) * (2, 3) to equal (2.0, 6.0)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2) * (2, 3)");

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 6.0)");
	});

	test("(10, 20) / (5, 10) to equal (2.0, 2.0)", () => {
		const result = vectorArithmeticProvider.provide("(10, 20) / (5, 10)");

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 2.0)");
	});
});

describe("Vector3", () => {
	test("vec3(1, 2, 3) to equal (1.000, 2.000, 3.000)", () => {
		const result = vectorArithmeticProvider.provide("vec3(1, 2, 3)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0, 3.0)");
	});

	test("(1, 2, 3) to equal (1.000, 2.000, 3.000)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2, 3)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0, 3.0)");
	});

	test("(1, 2, 3) + (10, 12, 13) to equal (11.000, 14.000, 16.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3) + (10, 12, 13)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(11, 14, 16)");
	});

	test("(1, 2, 3) - (10, 12, 13) to equal (-9.000, -10.00, -10.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3) - (10, 12, 13)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(-9.0, -10, -10)");
	});

	test("(1, 2, 3) * (2, 3, 4) to equal (2.000, 6.000, 12.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3) * (2, 3, 4)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 6.0, 12)");
	});

	test("(10, 20, 30) / (5, 10, 10) to equal (2.000, 2.000, 3.000)", () => {
		const result = vectorArithmeticProvider.provide(
			"(10, 20, 30) / (5, 10, 10)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 2.0, 3.0)");
	});
});

describe("Vector4", () => {
	test("vec4(1, 2, 3, 4) to equal (1.000, 2.000, 3.000, 4.000)", () => {
		const result = vectorArithmeticProvider.provide("vec4(1, 2, 3, 4)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0, 3.0, 4.0)");
	});

	test("(1, 2, 3, 4) to equal (1.000, 2.000, 3.000, 4.000)", () => {
		const result = vectorArithmeticProvider.provide("(1, 2, 3, 4)");

		expect(result).toBeDefined();

		expect(result).toBe("(1.0, 2.0, 3.0, 4.0)");
	});

	test("(1, 2, 3, 4) + (10, 12, 13, 14) to equal (11.000, 14.000, 16.00, 18.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3, 4) + (10, 12, 13, 14)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(11, 14, 16, 18)");
	});

	test("(1, 2, 3, 4) - (10, 12, 13, 14) to equal (-9.000, -10.00, -10.00, -10.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3, 4) - (10, 12, 13, 14)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(-9.0, -10, -10, -10)");
	});

	test("(1, 2, 3, 4) * (2, 3, 4, 5) to equal (2.000, 6.000, 12.00, 20.00)", () => {
		const result = vectorArithmeticProvider.provide(
			"(1, 2, 3, 4) * (2, 3, 4, 5)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 6.0, 12, 20)");
	});

	test("(10, 20, 30, 40) / (5, 10, 10, 10) to equal (2.000, 2.000, 3.000, 4.000)", () => {
		const result = vectorArithmeticProvider.provide(
			"(10, 20, 30, 40) / (5, 10, 10, 10)"
		);

		expect(result).toBeDefined();

		expect(result).toBe("(2.0, 2.0, 3.0, 4.0)");
	});
});
