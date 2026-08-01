/**
 * Pure text-conversion tests for `convertLatexToSolve()` — see GitHub
 * issue #37 and `LatexConverter.ts`'s own module doc for the documented
 * subset this covers (not full LaTeX).
 */
import { describe, expect, test } from "@jest/globals";
import { convertLatexToSolve } from "@solve-js/packages/latex";

describe("convertLatexToSolve — supported subset", () => {
	test("plain arithmetic passes through unchanged", () => {
		expect(convertLatexToSolve("(2.14e-5)*2*70")).toBe("(2.14e-5)*2*70");
	});

	test("\\frac{a}{b} -> (a)/(b)", () => {
		expect(convertLatexToSolve(String.raw`\frac{1}{2}`)).toBe("(1)/(2)");
	});

	test("nested \\frac converts both levels", () => {
		expect(convertLatexToSolve(String.raw`\frac{\frac{1}{2}}{3}`)).toBe("((1)/(2))/(3)");
	});

	test("multiple \\frac occurrences in one expression", () => {
		expect(convertLatexToSolve(String.raw`\frac{1}{2} + \frac{1}{4}`)).toBe("(1)/(2) + (1)/(4)");
	});

	test("\\sqrt{x} -> sqrt(x)", () => {
		expect(convertLatexToSolve(String.raw`\sqrt{16}`)).toBe("sqrt(16)");
	});

	test("\\sqrt[n]{x} -> root(n, x)", () => {
		expect(convertLatexToSolve(String.raw`\sqrt[3]{27}`)).toBe("root(3, 27)");
	});

	test("\\times, \\cdot, \\div all convert to their operator", () => {
		expect(convertLatexToSolve(String.raw`2 \times 3`)).toBe("2 * 3");
		expect(convertLatexToSolve(String.raw`2 \cdot 3`)).toBe("2 * 3");
		expect(convertLatexToSolve(String.raw`6 \div 2`)).toBe("6 / 2");
	});

	test("\\left/\\right are stripped, leaving plain parens", () => {
		expect(convertLatexToSolve(String.raw`\left(2 + 3\right)`)).toBe("(2 + 3)");
	});

	test("\\pi maps to the real constant", () => {
		expect(convertLatexToSolve(String.raw`\pi * 2`)).toBe("pi * 2");
	});

	test("^{...} exponent braces become ^(...)", () => {
		expect(convertLatexToSolve("2^{3}")).toBe("2^(3)");
	});

	test("bare ^n (no braces) passes through untouched", () => {
		expect(convertLatexToSolve("2^3")).toBe("2^3");
	});

	test("nested exponent braces convert fully", () => {
		expect(convertLatexToSolve("2^{3^{4}}")).toBe("2^(3^(4))");
	});

	test("plain grouping braces (not part of \\frac/\\sqrt/^) become parens", () => {
		expect(convertLatexToSolve("{2 + 3} * 4")).toBe("(2 + 3) * 4");
	});

	test("implicit multiply: ) immediately before a digit", () => {
		expect(convertLatexToSolve("(2 + 3)2")).toBe("(2 + 3)*2");
	});

	test("implicit multiply: a digit immediately before (", () => {
		expect(convertLatexToSolve("2(3 + 4)")).toBe("2*(3 + 4)");
	});

	test("implicit multiply: ) immediately before (", () => {
		expect(convertLatexToSolve("(2)(3)")).toBe("(2)*(3)");
	});

	test("implicit multiply is NOT inserted where there's already whitespace or an operator", () => {
		expect(convertLatexToSolve("(2 + 3) * 2")).toBe("(2 + 3) * 2");
	});
});

describe("convertLatexToSolve — regression guards on scope boundaries", () => {
	test("an unrecognized LaTeX command throws a clear, named error rather than silently stripping it", () => {
		expect(() => convertLatexToSolve(String.raw`\unknown{5}`)).toThrow(/unsupported latex command.*\\unknown/i);
	});

	test("a malformed \\frac (missing the second brace group) throws rather than guessing", () => {
		expect(() => convertLatexToSolve(String.raw`\frac{1}`)).toThrow();
	});

	test("an unmatched brace throws rather than silently truncating", () => {
		expect(() => convertLatexToSolve(String.raw`\sqrt{16`)).toThrow();
	});

	test("Greek letters other than pi convert to plain identifiers (undefined-until-declared, not a guessed value)", () => {
		// This only checks the STRING conversion — evaluating an undefined
		// bare identifier is a separate, already-covered engine behavior.
		expect(convertLatexToSolve(String.raw`\alpha + \beta`)).toBe("alpha + beta");
	});
});
