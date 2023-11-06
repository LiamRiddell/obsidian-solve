import { VectorArithmeticProvider } from "@/providers/vector/VectorArithmeticProvider";
import { Vector2Result } from "@/results/Vector2Result";
import { Vector3Result } from "@/results/Vector3Result";
import { Vector4Result } from "@/results/Vector4Result";
import { beforeAll, describe, expect, test } from "@jest/globals";

let vectorArithmeticProvider: VectorArithmeticProvider;

beforeAll(() => {
	vectorArithmeticProvider = new VectorArithmeticProvider();
});

describe("Vector2", () => {
	test("vec2(1, 2)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>("vec2(1, 2)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
		});
	});

	test("(1, 2)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>("(1, 2)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
		});
	});

	test("(1, 2) + (10, 12)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>(
				"(1, 2) + (10, 12)"
			);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 11.0,
			y: 14.0,
		});
	});

	test("(1, 2) - (10, 12)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>(
				"(1, 2) - (10, 12)"
			);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: -9.0,
			y: -10.0,
		});
	});

	test("(1, 2) * (2, 3)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>("(1, 2) * (2, 3)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 6.0,
		});
	});

	test("(10, 20) / (5, 10)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector2Result>(
				"(10, 20) / (5, 10)"
			);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 2.0,
		});
	});

	test("vec2(10 * 2 / 22, 2)", () => {
		const result = vectorArithmeticProvider.provide<Vector2Result>(
			"vec2(10 * 2 / 22, 2)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: (10 * 2) / 22,
			y: 2.0,
		});
	});
});

describe("Vector3", () => {
	test("vec3(1, 2, 3)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector3Result>("vec3(1, 2, 3)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
			z: 3.0,
		});
	});

	test("(1, 2, 3)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector3Result>("(1, 2, 3)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
			z: 3.0,
		});
	});

	test("(1, 2, 3) + (10, 12, 13)", () => {
		const result = vectorArithmeticProvider.provide<Vector3Result>(
			"(1, 2, 3) + (10, 12, 13)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 11.0,
			y: 14.0,
			z: 16.0,
		});
	});

	test("(1, 2, 3) - (10, 12, 13)", () => {
		const result = vectorArithmeticProvider.provide<Vector3Result>(
			"(1, 2, 3) - (10, 12, 13)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: -9.0,
			y: -10.0,
			z: -10.0,
		});
	});

	test("(1, 2, 3) * (2, 3, 4)", () => {
		const result = vectorArithmeticProvider.provide<Vector3Result>(
			"(1, 2, 3) * (2, 3, 4)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 6.0,
			z: 12.0,
		});
	});

	test("(10, 20, 30) / (5, 10, 10)", () => {
		const result = vectorArithmeticProvider.provide<Vector3Result>(
			"(10, 20, 30) / (5, 10, 10)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 2.0,
			z: 3.0,
		});
	});

	test("Vec3(10 * 2 / 22, 2, 3)", () => {
		const result = vectorArithmeticProvider.provide<Vector3Result>(
			"Vec3(10 * 2 / 22, 2, 3)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: (10 * 2) / 22,
			y: 2.0,
			z: 3.0,
		});
	});
});

describe("Vector4", () => {
	test("vec4(1, 2, 3, 4)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector4Result>("vec4(1, 2, 3, 4)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
			z: 3.0,
			w: 4.0,
		});
	});

	test("(1, 2, 3, 4)", () => {
		const result =
			vectorArithmeticProvider.provide<Vector4Result>("(1, 2, 3, 4)");

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 1.0,
			y: 2.0,
			z: 3.0,
			w: 4.0,
		});
	});

	test("(1, 2, 3, 4) + (10, 12, 13, 14)", () => {
		const result = vectorArithmeticProvider.provide<Vector4Result>(
			"(1, 2, 3, 4) + (10, 12, 13, 14)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 11.0,
			y: 14.0,
			z: 16.0,
			w: 18.0,
		});
	});

	test("(1, 2, 3, 4) - (10, 12, 13, 14)", () => {
		const result = vectorArithmeticProvider.provide<Vector4Result>(
			"(1, 2, 3, 4) - (10, 12, 13, 14)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: -9.0,
			y: -10.0,
			z: -10.0,
			w: -10.0,
		});
	});

	test("(1, 2, 3, 4) * (2, 3, 4, 5)", () => {
		const result = vectorArithmeticProvider.provide<Vector4Result>(
			"(1, 2, 3, 4) * (2, 3, 4, 5)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 6.0,
			z: 12.0,
			w: 20.0,
		});
	});

	test("(10, 20, 30, 40) / (5, 10, 10, 10)", () => {
		const result = vectorArithmeticProvider.provide<Vector4Result>(
			"(10, 20, 30, 40) / (5, 10, 10, 10)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: 2.0,
			y: 2.0,
			z: 3.0,
			w: 4.0,
		});
	});

	test("Vec4(10 * 2 / 22, 2, 3, 4 + 2)", () => {
		const result = vectorArithmeticProvider.provide<Vector4Result>(
			"Vec4(10 * 2 / 22, 2, 3, 4 + 2)"
		);

		expect(result).toBeDefined();

		expect(result?.value).toStrictEqual({
			x: (10 * 2) / 22,
			y: 2.0,
			z: 3.0,
			w: 4 + 2,
		});
	});
});
