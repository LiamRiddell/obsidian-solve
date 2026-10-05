/**
 * What a commit writes (#92). A full line keeps its value as a trailing
 * comment, so the line and every line that reads it keep working; each case
 * is evaluated again after the commit to prove it.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "solve-engine/engine";
import { BUILTIN_PACKAGES } from "solve-engine/packages";
import { formatValue } from "solve-engine/format";
import { commentStart, commitFullLine, commitInlineSolve } from "@app/commit/CommitLine";

/** Each line's answer through a whole-document pass, as the plugin's evaluator reads a note. */
function answers(doc: string): string[] {
	const engine = new ExpressionEngine({ packages: BUILTIN_PACKAGES, config: { network: { enabled: false } } });
	return engine.parseDocument(doc).lines.map((l) => (l.result ? (l.result.isError() ? `ERROR ${l.result.errorCode}` : formatValue(l.result)) : l.error ? "ERROR" : ""));
}

describe("a full-line commit is a trailing comment", () => {
	test.each([
		["1000 + 200", "= 1,200", "1000 + 200 // = 1,200"],
		["price = 1000 + 200", "= 1,200", "price = 1000 + 200 // = 1,200"],
		["1000 + 200 // rent", "= 1,200", "1000 + 200 // rent = 1,200"],
		["1000 + 200   ", "= 1,200", "1000 + 200 // = 1,200"],
		["50 #food", "= 50", "50 #food // = 50"],
	])("%s commits as %s", (line, result, committed) => {
		expect(commitFullLine(line, result)).toBe(committed);
	});

	test("the committed line and every line that reads it keep their answers", () => {
		expect(answers("1000 + 200 // = 1,200\nline 1 * 2")).toEqual(["= 1,200", "= 2,400"]);
		expect(answers("price = 1000 + 200 // = 1,200\nprice * 2")).toEqual(["= 1,200", "= 2,400"]);
		expect(answers("1000 + 200 // = 1,200\n300\ntotal above")).toEqual(["= 1,200", "= 300", "= 1,500"]);
		expect(answers("1000 + 200 // rent = 1,200\nline 1 * 2")).toEqual(["= 1,200", "= 2,400"]);
		expect(answers("50 #food // = 50\n20 #food\ntotal of #food")).toEqual(["= 50", "= 20", "= 70"]);
	});

	test("the old form broke the line and the lines that read it, which is why it changed", () => {
		expect(answers("1000 + 200 = 1,200\nline 1 * 2")[0]).toMatch(/^ERROR/);
	});

	test("committing again replaces the earlier value rather than adding a second", () => {
		expect(commitFullLine("1000 + 200 // = 1,200", "= 1,300")).toBe("1000 + 200 // = 1,300");
		expect(commitFullLine("1000 + 200 // rent = 1,200", "= 1,300")).toBe("1000 + 200 // rent = 1,300");
		const twice = commitFullLine(commitFullLine("1 + 1", "= 2"), "= 2");
		expect(twice).toBe("1 + 1 // = 2");
	});

	test("explicit mode: the trailing = is replaced, not doubled", () => {
		expect(commitFullLine("1000 + 200 =", "= 1,200")).toBe("1000 + 200 // = 1,200");
		expect(commitFullLine("1000 + 200=  ", "= 1,200")).toBe("1000 + 200 // = 1,200");
		expect(answers("1000 + 200 // = 1,200")).toEqual(["= 1,200"]);
	});

	test("a result that arrives without its = is written with one", () => {
		expect(commitFullLine("2 + 2", "4")).toBe("2 + 2 // = 4");
	});
});

describe("commentStart", () => {
	test("finds the comment, and skips a // inside a quoted string as the engine does", () => {
		expect(commentStart("1 + 1 // note")).toBe(6);
		expect(commentStart('"a // b" // = x')).toBe(9);
		expect(commentStart("'it''s // here'")).toBe(-1);
		expect(commentStart("`x // y`")).toBe(-1);
		expect(commentStart('"a \\" // still text"')).toBe(-1);
		expect(commentStart("no comment")).toBe(-1);
		expect(commentStart("")).toBe(-1);
	});

	test("a quoted // stays text through a commit", () => {
		const committed = commitFullLine('"a // b"', "= a // b");
		expect(committed).toBe('"a // b" // = a // b');
		expect(answers(committed)).toEqual(["= a // b"]);
	});
});

describe("an inline solve keeps its own path", () => {
	const options = { includeEqualsOnCommit: false, includeExpressionOnCommit: false, includeBackticksOnCommit: false };

	test("the span is replaced by plain text, as the settings say", () => {
		expect(commitInlineSolve("Total s`2 + 2` today", "2 + 2", "= 4", options)).toBe("Total 4 today");
		expect(commitInlineSolve("Total s`2 + 2`", "2 + 2", "= 4", { ...options, includeEqualsOnCommit: true })).toBe("Total = 4");
		expect(commitInlineSolve("Total s`2 + 2`", "2 + 2", "= 4", { ...options, includeExpressionOnCommit: true })).toBe("Total 2 + 2 = 4");
		expect(commitInlineSolve("Total s`2 + 2`", "2 + 2", "= 4", { ...options, includeBackticksOnCommit: true })).toBe("Total `4`");
	});

	test("an inline solve on a line with a comment replaces its span, not the comment", () => {
		expect(commitInlineSolve("Rent s`1000 + 200` // monthly", "1000 + 200", "= 1,200", options)).toBe("Rent 1,200 // monthly");
	});
});

describe("adversarial", () => {
	test("security: a $ pattern in a value is written as it is, not read as a replacement pattern", () => {
		const options = { includeEqualsOnCommit: false, includeExpressionOnCommit: false, includeBackticksOnCommit: false };
		for (const value of ["= $&", "= $'", "= $`", "= $1", "= $$15.00"]) {
			expect(commitInlineSolve("x s`a` y", "a", value, options)).toBe(`x ${value.replace(/^= /, "")} y`);
			expect(commitFullLine("a", value)).toBe(`a // ${value}`);
		}
	});

	test("realistic: a user comment ending in == or an inequality keeps its words", () => {
		expect(commitFullLine("5 // a == b", "= 5")).toBe("5 // a == b = 5");
		expect(commitFullLine("5 // x >= 3", "= 5")).toBe("5 // x >= 3 = 5");
	});

	test("edge: an empty line, a line of only a comment, and a very long line", () => {
		expect(commitFullLine("", "= 0")).toBe("// = 0");
		expect(commitFullLine("// just words", "= 1")).toBe("// just words = 1");
		const long = "1 + ".repeat(5000) + "1";
		expect(commitFullLine(long, "= 5,001").endsWith("1 // = 5,001")).toBe(true);
	});
});
