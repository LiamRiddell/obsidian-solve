import { describe, expect, test } from "@jest/globals";
import { BindingPower } from "@solve-js/parser/BindingPower";

describe("BindingPower", () => {
	test("has expected precedence values", () => {
		expect(BindingPower.Lowest).toBe(0);
		expect(BindingPower.Sum).toBe(30);
		expect(BindingPower.Product).toBe(40);
		expect(BindingPower.Exponent).toBe(50);
		expect(BindingPower.Call).toBe(80);
	});
});
