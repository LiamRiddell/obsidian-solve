/**
 * Real-engine integration tests for `createLatexPackage()` — see GitHub
 * issue #37. Every real-document behavior goes through a fully
 * constructed ExpressionEngine, not just the isolated converter, per
 * this codebase's established bar (see `LatexConverter.spec.ts` for the
 * pure text-transform unit tests).
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { createLatexPackage } from "@solve-js/packages/latex";

function engineWithLatex(): ExpressionEngine {
	return new ExpressionEngine("en", false, undefined, undefined, [...BUILTIN_PACKAGES, createLatexPackage()]);
}

describe("createLatexPackage — descriptor shape", () => {
	test("is NOT included in BUILTIN_PACKAGES (claims $...$, which collides with the currency prefix)", () => {
		const pkg = createLatexPackage();
		expect(BUILTIN_PACKAGES).not.toContain(pkg);
		expect(BUILTIN_PACKAGES.some((p) => p.name === "solve-latex")).toBe(false);
	});
});

describe("createLatexPackage — the issue's own example, end to end", () => {
	test(String.raw`$\triangle V = (2.14e-5)*2*70$ evaluates the RHS, discarding the LaTeX label`, () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\triangle V = (2.14e-5)*2*70$`);
		expect(value.toNumber()).toBeCloseTo(2.14e-5 * 2 * 70, 10);
	});

	test("the same expression without the LaTeX label produces an identical result", () => {
		const engine = engineWithLatex();
		const withLabel = engine.evaluateExpression(String.raw`$\triangle V = (2.14e-5)*2*70$`)[0];
		const withoutLabel = engine.evaluateExpression(String.raw`$(2.14e-5)*2*70$`)[0];
		expect(withLabel.value).toBe(withoutLabel.value);
	});
});

describe("createLatexPackage — real-world LaTeX shapes", () => {
	test("fractions", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\frac{1}{2} + \frac{1}{4}$`);
		expect(value.toNumber()).toBe(0.75);
	});

	test("square root and n-th root", () => {
		const engine = engineWithLatex();
		expect(engine.evaluateExpression(String.raw`$\sqrt{16}$`)[0].toNumber()).toBe(4);
		expect(engine.evaluateExpression(String.raw`$\sqrt[3]{27}$`)[0].toNumber()).toBe(3);
	});

	test("multiplication/division command variants", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$2 \times 3 \cdot 4 \div 2$`);
		expect(value.toNumber()).toBe(12);
	});

	test("\\left/\\right auto-sizing parens", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\left(2 + 3\right) \times 4$`);
		expect(value.toNumber()).toBe(20);
	});

	test("pi constant", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\pi \times 2$`);
		expect(value.toNumber()).toBeCloseTo(Math.PI * 2, 10);
	});

	test("exponent braces", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression("$2^{3}$");
		expect(value.toNumber()).toBe(8);
	});

	test("implicit multiplication by juxtaposition (the exact caveat raised in the issue thread)", () => {
		const engine = engineWithLatex();
		expect(engine.evaluateExpression("$(2 + 3)2$")[0].toNumber()).toBe(10);
		expect(engine.evaluateExpression("$2(3 + 4)$")[0].toNumber()).toBe(14);
	});
});

describe("createLatexPackage — realistic multi-feature expressions", () => {
	test("the quadratic formula (positive root of x^2 + 2x - 3 = 0)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\frac{-2 + \sqrt{2^{2} - 4 \times 1 \times (-3)}}{2 \times 1}$`);
		expect(value.toNumber()).toBe(1);
	});

	test("kinetic + potential energy (frac, exponent, and multiple \\times terms together)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\frac{1}{2} \times 5 \times 3^{2} + 5 \times 9.8 \times 2$`);
		expect(value.toNumber()).toBe(120.5);
	});

	test("a sqrt wrapping a frac wrapping more fracs and a sqrt (deep nesting)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\sqrt{\frac{\frac{1}{2} + \frac{1}{4}}{\sqrt{9}}}$`);
		expect(value.toNumber()).toBe(0.5);
	});

	test("heavy implicit multiplication with no explicit \\times anywhere", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$\frac{1}{2}(5)(3)^{2}$`);
		expect(value.toNumber()).toBe(22.5);
	});

	test("a subscripted label (v_1) is discarded along with the rest of the label, not evaluated", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression(String.raw`$v_1 = \frac{10}{2}$`);
		expect(value.toNumber()).toBe(5);
	});
});

describe("createLatexPackage — regression guards", () => {
	test("ordinary currency usage is completely unaffected (doesn't start AND end with a single $)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression("$5 + $3");
		expect(value.toNumber()).toBe(8);
	});

	test("a bare currency amount is unaffected (doesn't start AND end with $, so the guard never fires)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression("$5");
		expect(value.toNumber()).toBe(5);
		expect(value.unit).toBe("USD");
	});

	test("an expression with no $ at all is completely unaffected", () => {
		const engine = engineWithLatex();
		expect(engine.evaluateExpression("5 + 5")[0].toNumber()).toBe(10);
	});

	test("an unsupported LaTeX command surfaces a clear error, not a wrong number", () => {
		const engine = engineWithLatex();
		expect(() => engine.evaluateExpression(String.raw`$\unknown{5}$`)).toThrow(/unsupported latex command/i);
	});

	test("an undefined Greek-letter variable surfaces a clear error, not a wrong number", () => {
		const engine = engineWithLatex();
		expect(() => engine.evaluateExpression(String.raw`$\alpha + 1$`)).toThrow(/undefined variable/i);
	});

	test("without the package registered, $...$ is left completely alone (opt-in, not a default behavior change)", () => {
		const engine = new ExpressionEngine("en", false, undefined, undefined, BUILTIN_PACKAGES);
		expect(() => engine.evaluateExpression(String.raw`$\triangle V = (2.14e-5)*2*70$`)).toThrow();
	});

	test("s`...` inline-solve syntax still works with the package registered (both hooks coexist)", () => {
		const engine = engineWithLatex();
		const [value] = engine.evaluateExpression("s`2 + 2`");
		expect(value.toNumber()).toBe(4);
	});
});
