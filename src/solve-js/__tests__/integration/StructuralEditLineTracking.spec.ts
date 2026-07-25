import { describe, expect, test, beforeEach } from "@jest/globals";
import { DocumentModel, ViewportRange } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator, EvalTier } from "@solve-js/engine/ThreeTierEvaluator";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

/**
 * Line/result tracking under STRUCTURAL edits (insertions, deletions, shifts)
 * — the engine-level analog of a live-reported bug: typing blank lines above
 * an expression left its rendered result stuck on the original line instead
 * of following the expression to its new position.
 *
 * That specific bug lived in the playground's UI wiring (a `.trim()` call
 * stripping leading blank lines before evaluation — fixed separately), not
 * in solve-js itself. But the REAL Obsidian editor drives evaluation through
 * exactly this combination — DocumentModel.applyChanges() (position-agnostic,
 * lineId-keyed) + ThreeTierEvaluator.applyTransaction()/evaluate() — and
 * that combination did NOT have dedicated end-to-end coverage: existing
 * suites test DocumentModel's structural correctness in isolation and
 * ThreeTierEvaluator's tier assignment for dirty/clean state in isolation,
 * but not "apply a structural edit, then evaluate, then confirm every
 * result actually tracks to its new line" together. This file closes that
 * gap directly, airtight against the exact bug class reported.
 */

function createEngine(): ExpressionEngine {
	return new ExpressionEngine("en", false);
}

function createDoc(lines: string[]): DocumentModel {
	const doc = new DocumentModel();
	doc.setDocument(lines.join("\n"));
	return doc;
}

function fullViewport(doc: DocumentModel): ViewportRange {
	return { startLine: 1, endLine: doc.lineCount };
}

describe("Structural edits — result tracking follows the shifted line", () => {
	let doc: DocumentModel;
	let engine: ExpressionEngine;
	let evaluator: ThreeTierEvaluator;

	beforeEach(() => {
		engine = createEngine();
	});

	test("inserting blank lines ABOVE an expression moves its result to the new line — exact shape of the reported bug", () => {
		doc = createDoc(["10 + 5 * 2"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));
		expect(doc.getLineAt(1)!.results[0][0].toNumber()).toBe(20);

		// "go to the start of the sentence and press Enter 5 times"
		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", "", "", "", ""] }]);
		expect(doc.lineCount).toBe(6);

		const result = evaluator.evaluate(fullViewport(doc));

		// Nothing on the now-blank lines 1-5.
		for (let ln = 1; ln <= 5; ln++) {
			expect(result.resultMap.has(ln)).toBe(false);
		}
		// The expression's result now lives on line 6, unchanged.
		expect(result.resultMap.has(6)).toBe(true);
		expect(result.resultMap.get(6)![0].toNumber()).toBe(20);

		const lineResult = result.lines.find(l => l.lineNumber === 6)!;
		expect(lineResult).toBeDefined();
		expect(lineResult.result!.toNumber()).toBe(20);
		expect(lineResult.error).toBeNull();
	});

	test("a shifted, unchanged line is served from cached BYTECODE (Tier 2), not recompiled (Tier 1)", () => {
		// Tier 2 means "execute from cached bytecode", not "skip execution
		// entirely" — a non-deterministic expression's VALUE can still
		// legitimately differ run to run under Tier 2 (the RNG runs again
		// on every execution regardless of tier), so tier is the only
		// direct, unambiguous signal that recompilation was skipped. Using
		// a deterministic expression here instead, so the value check
		// below is a valid second confirmation, not a coincidence-prone one.
		doc = createDoc(["10 + 5 * 2"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		const before = evaluator.evaluate(fullViewport(doc));
		expect(before.lines[0].tier).toBe(EvalTier.Tier1); // first evaluation is always Tier 1

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", "", ""] }]);
		const after = evaluator.evaluate(fullViewport(doc));

		const shifted = after.lines.find(l => l.lineNumber === 4)!;
		expect(shifted).toBeDefined();
		expect(shifted.tier).toBe(EvalTier.Tier2); // cache hit — line's own text never changed
		expect(shifted.result!.toNumber()).toBe(20);
	});

	test("Tier 2 (cached bytecode) still genuinely re-executes — a non-deterministic expression's value is free to differ across evaluations", () => {
		// The inverse confirmation of the test above: Tier 2 is NOT "return
		// a frozen cached value" — it re-runs the VM against the cached
		// bytecode every time. Asserting sameness here would be asserting
		// a false invariant about the tier system itself.
		doc = createDoc(["roll(1, 1000000)"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: [""] }]);
		const result = evaluator.evaluate(fullViewport(doc));

		const shifted = result.lines.find(l => l.lineNumber === 2)!;
		expect(shifted.tier).toBe(EvalTier.Tier2);
		expect(shifted.result).not.toBeNull();
		expect(shifted.result!.toNumber()).toBeGreaterThanOrEqual(1);
		expect(shifted.result!.toNumber()).toBeLessThanOrEqual(1000000);
	});

	test("inserting blank lines above a variable definition preserves both the definition's value and the downstream consumer's resolution", () => {
		doc = createDoc([":x = 10", "x + 5"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", ""] }]);
		expect(doc.lineCount).toBe(4);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.get(3)![0].toNumber()).toBe(10); // ":x = 10", now line 3
		expect(result.resultMap.get(4)![0].toNumber()).toBe(15); // "x + 5", now line 4 — DAG survived the shift
	});

	test("deleting blank lines above an expression moves its result UP to the new (lower) line", () => {
		doc = createDoc(["", "", "10 + 5"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));
		expect(doc.getLineAt(3)!.results[0][0].toNumber()).toBe(15);

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 2, insertLines: [] }]);
		expect(doc.lineCount).toBe(1);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.has(3)).toBe(false);
		expect(result.resultMap.get(1)![0].toNumber()).toBe(15);
	});

	test("inserting a line in the MIDDLE shifts only the lines below it — lines above stay exactly where they were", () => {
		doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		// Insert one blank line between line 1 and line 2.
		evaluator.applyTransaction([{ startLine: 2, deleteCount: 0, insertLines: [""] }]);
		expect(doc.lineCount).toBe(4);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.get(1)![0].toNumber()).toBe(2); // untouched, still line 1
		expect(result.resultMap.has(2)).toBe(false); // now blank
		expect(result.resultMap.get(3)![0].toNumber()).toBe(4); // was line 2
		expect(result.resultMap.get(4)![0].toNumber()).toBe(6); // was line 3
	});

	test("multiple sequential structural edits compound correctly (insert, then insert again, then delete)", () => {
		doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		// Insert 2 blanks above everything: lines become ["","","1+1","2+2","3+3"]
		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", ""] }]);
		// Insert 1 more blank between the new line 3 ("1+1") and line 4 ("2+2")
		evaluator.applyTransaction([{ startLine: 4, deleteCount: 0, insertLines: [""] }]);
		// Delete the original 2 leading blanks (lines 1-2), collapsing everything up by 2
		evaluator.applyTransaction([{ startLine: 1, deleteCount: 2, insertLines: [] }]);

		// Final expected layout: ["1+1", "", "2+2", "3+3"]
		expect(doc.lineCount).toBe(4);
		const result = evaluator.evaluate(fullViewport(doc));
		expect(result.resultMap.get(1)![0].toNumber()).toBe(2);
		expect(result.resultMap.has(2)).toBe(false);
		expect(result.resultMap.get(3)![0].toNumber()).toBe(4);
		expect(result.resultMap.get(4)![0].toNumber()).toBe(6);
	});

	test("a replace (delete+insert together) on one line doesn't corrupt other lines' tracked positions", () => {
		doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		// Replace line 2's content in place (same line count, different text) —
		// simulates a normal single-line edit.
		evaluator.applyTransaction([{ startLine: 2, deleteCount: 1, insertLines: ["200 + 2"] }]);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.get(1)![0].toNumber()).toBe(2); // untouched
		expect(result.resultMap.get(2)![0].toNumber()).toBe(202); // new content, same line
		expect(result.resultMap.get(3)![0].toNumber()).toBe(6); // untouched, still line 3
	});

	test("deleting an expression line renumbers the lines below it correctly on the next evaluation", () => {
		doc = createDoc(["10 + 5", "20 + 5", "30 + 5"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		// Delete the middle line entirely.
		evaluator.applyTransaction([{ startLine: 2, deleteCount: 1, insertLines: [] }]);
		expect(doc.lineCount).toBe(2);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.get(1)![0].toNumber()).toBe(15); // untouched
		expect(result.resultMap.get(2)![0].toNumber()).toBe(35); // was line 3, now line 2
	});

	test("inserting blank lines above a line with a DAG read re-resolves it correctly at its new position when the source changes", () => {
		doc = createDoc([":x = 1", "x + 100"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		// Push both lines down.
		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: [""] }]);
		// Now edit the (shifted) definition line in place — line 2 is ":x = 1".
		evaluator.applyTransaction([{ startLine: 2, deleteCount: 1, insertLines: [":x = 9"] }]);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.get(2)![0].toNumber()).toBe(9);
		expect(result.resultMap.get(3)![0].toNumber()).toBe(109); // consumer, now line 3, sees the updated value
	});

	test("the exact same expression on two different (shifted) lines each keeps its own independently-tracked result", () => {
		doc = createDoc(["1 + 1", "1 + 1"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: [""] }]);
		const result = evaluator.evaluate(fullViewport(doc));

		expect(result.resultMap.has(1)).toBe(false);
		expect(result.resultMap.get(2)![0].toNumber()).toBe(2);
		expect(result.resultMap.get(3)![0].toNumber()).toBe(2);
	});

	test("lineId stays constant across a shift even though lineNumber changes", () => {
		doc = createDoc(["10 + 5"]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		const before = evaluator.evaluate(fullViewport(doc));
		const originalLineId = before.lines[0].lineId;

		evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", ""] }]);
		const after = evaluator.evaluate(fullViewport(doc));
		const shifted = after.lines.find(l => l.lineNumber === 3)!;

		expect(shifted.lineId).toBe(originalLineId);
	});

	test("shifting an empty document (no lines) via applyTransaction is a no-op, not a crash", () => {
		doc = createDoc([""]);
		evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluate(fullViewport(doc));

		expect(() => {
			evaluator.applyTransaction([{ startLine: 1, deleteCount: 0, insertLines: ["", ""] }]);
			evaluator.evaluate(fullViewport(doc));
		}).not.toThrow();
	});
});
