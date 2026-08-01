/**
 * GitHub issues #45's follow-ups (trailing bare "=" tolerance) and #65
 * (trailing "=" + labeled-line prefix, "<label>: <expression>") both
 * changed the SAME shared code path — `ExpressionEngine.ts`'s
 * `parseExpression()`, the single place every line in every package goes
 * through. A change there has the widest possible blast radius in this
 * codebase, so this file sweeps a representative expression from every
 * built-in package and asserts the trailing-"=" and labeled-prefix forms
 * produce the EXACT SAME result as the plain, unmodified form — not just
 * "doesn't throw." Anything that produces a DIFFERENT value with a label/
 * trailing "=" attached would be a silent-wrong-answer regression, this
 * codebase's worst failure class.
 *
 * A second block below specifically targets every package that legitimately
 * consumes a COLON token as part of its own grammar (lines range syntax,
 * GMT offsets, clock/lap/video times, variable definitions) — the exact
 * collision class both new features were designed to avoid.
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { Value } from "@solve-js/vm/Value";

/** Structural equality good enough to catch a silently-different answer. */
function sameValue(a: Value, b: Value): boolean {
	return a.type === b.type && String(a.value) === String(b.value) && a.unit === b.unit;
}

function evalOnce(expr: string): Value {
	const engine = new ExpressionEngine();
	const [v] = engine.evaluateExpression(expr);
	return v;
}

/**
 * Asserts plain / trailing-"=" / labeled-prefix all produce the identical
 * result for one representative expression from a package.
 */
function assertUnaffected(expr: string) {
	const plain = evalOnce(expr);
	const trailingEquals = evalOnce(`${expr}=`);
	const labeled = evalOnce(`note: ${expr}`);
	const both = evalOnce(`note: ${expr}=`);
	expect(sameValue(trailingEquals, plain)).toBe(true);
	expect(sameValue(labeled, plain)).toBe(true);
	expect(sameValue(both, plain)).toBe(true);
}

describe("language sweep — trailing '=' and labeled prefix leave every package's own results unchanged", () => {
	test.each([
		["Arithmetic", "10 + 5 * 2"],
		["Percentage — of", "10% of 20"],
		["Percentage — solve for base", "5% of what is 20"],
		["Date literal", "25/12/2023"],
		["Units of measurement", "100cm to m"],
		["Vector", "vec2(1, 2) + vec2(3, 4)"],
		["BigInt", "12345678901234567890n + 1n"],
		["Conditionals — comparison", "5 > 3"],
		["Conditionals — if/then/else", "if 5 > 3 then 100 else 200"],
		["Converters — as hex", "255 as hex"],
		["MathPhrases — average of", "average of 2, 4, 6"],
		["MathPhrases — clamp", "clamp 15 between 0 and 10"],
		["Bases — hex()", "hex(255)"],
		["Bases — octal literal", "0o17"],
		["Functions — root", "root(3, 27)"],
		["Functions — factorial", "fact(5)"],
		["Finance — tax on", "tax on 300 at 20%"],
		["Time — clock time", "9:00am"],
		["Time — lap time", "03:04:05"],
		["Time — video timecode", "01:02:03:04 at 30 fps"],
		["Data units — binary prefix", "1 GiB to MiB"],
	])("%s: %s", (_category, expr) => {
		assertUnaffected(expr);
	});

	// Async (currency/weather) results are Pending Values, still safe to
	// compare structurally (queryKey included in .value) since evaluating
	// the same expression twice with a fresh engine produces the same key.
	test("Currency (async) is unaffected", () => {
		assertUnaffected("100 USD to EUR");
	});
});

describe("colon-consuming packages remain unaffected (the exact collision class both features exist to avoid)", () => {
	test("Cross-line range syntax ('sum(line 1 : line 4)') inside a real document", () => {
		const build = () => {
			const engine = new ExpressionEngine();
			const doc = new DocumentModel();
			return { engine, doc };
		};

		const { doc: plainDoc } = build();
		plainDoc.setDocument(["1", "2", "3", "4", "sum(line 1 : line 4)"].join("\n"));
		new ThreeTierEvaluator(plainDoc, new ExpressionEngine()).evaluate({ startLine: 1, endLine: 5 });
		const plainResult = plainDoc.getLineAt(5)!.result!;

		const { doc: labeledDoc } = build();
		labeledDoc.setDocument(["1", "2", "3", "4", "total: sum(line 1 : line 4)"].join("\n"));
		new ThreeTierEvaluator(labeledDoc, new ExpressionEngine()).evaluate({ startLine: 1, endLine: 5 });
		const labeledResult = labeledDoc.getLineAt(5)!.result!;

		expect(sameValue(labeledResult, plainResult)).toBe(true);
		expect(plainResult.toNumber()).toBe(10);
	});

	test("A GMT offset without minutes ('GMT+8') is unaffected", () => {
		assertUnaffected("3pm GMT+8 in Paris");
	});

	test("A label before a ':name = value' definition keeps the definition intact (the colon-priority regression this file exists to lock in)", () => {
		const engine = new ExpressionEngine();
		const [defResult] = engine.evaluateExpression("input value: :x = 5");
		expect(defResult.toNumber()).toBe(5);
		const [readResult] = engine.evaluateExpression(":x + 1");
		expect(readResult.toNumber()).toBe(6);
	});

	test("A label before a definition also tolerates a trailing '='", () => {
		const engine = new ExpressionEngine();
		const [value] = engine.evaluateExpression("note: :y = 10=");
		expect(value.toNumber()).toBe(10);
	});

	test("A user-defined function definition and call are both unaffected", () => {
		const engine = new ExpressionEngine();
		engine.evaluateExpression("f(x) = 2*x");
		const [value] = engine.evaluateExpression("f(5)");
		expect(value.toNumber()).toBe(10);
	});

	test("A labeled user-defined function call still works", () => {
		const engine = new ExpressionEngine();
		engine.evaluateExpression("f(x) = 2*x");
		const [value] = engine.evaluateExpression("result: f(5)");
		expect(value.toNumber()).toBe(10);
	});
});

describe("errors still surface — neither feature silently swallows a genuine mistake", () => {
	test.each([
		["a plain typo with no colon and no trailing '='", "5 3"],
		["two colons but nothing valid after either", "a: b: c d"],
		["a trailing '=' followed by more content", "5 + 3= 9"],
		["a doubled trailing '=='", "5 + 3=="],
		["an undefined variable reference (a runtime error, not a parse one — should still throw)", "note: :undefinedVar123 + 1"],
	])("%s: %s", (_desc, expr) => {
		const engine = new ExpressionEngine();
		expect(() => engine.evaluateExpression(expr)).toThrow();
	});
});
