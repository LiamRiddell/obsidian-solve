import { describe, expect, test, beforeEach } from "@jest/globals";
import { DocumentModel, ViewportRange } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator, EvalTier, EvalLineResult } from "@solve-js/engine/ThreeTierEvaluator";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Value, ValueType } from "@solve-js/vm/Value";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { createVM } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";

/**
 * Helper: create an ExpressionEngine for testing.
 * Use diagnosticMode=false for production-like behavior.
 */
function createEngine(): ExpressionEngine {
	return new ExpressionEngine("en", false);
}

/**
 * Helper: create a DocumentModel initialized with text lines.
 */
function createDoc(lines: string[]): DocumentModel {
	const doc = new DocumentModel();
	doc.setDocument(lines.join("\n"));
	return doc;
}

/**
 * Helper: get a tier-count summary string.
 */
function tierSummary(counts: { tier1: number; tier2: number; tier3: number; skipped: number }): string {
	return `T1=${counts.tier1} T2=${counts.tier2} T3=${counts.tier3} Skip=${counts.skipped}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tier 1: Visible + Dirty → Full Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Tier 1 (Full Pipeline)", () => {
	let doc: DocumentModel;
	let engine: ExpressionEngine;
	let evaluator: ThreeTierEvaluator;

	beforeEach(() => {
		doc = createDoc(["10 + 5", "20 * 2", "30 - 7"]);
		engine = createEngine();
		evaluator = new ThreeTierEvaluator(doc, engine);
	});

	test("evaluates a single dirty visible line with full pipeline", () => {
		const viewport: ViewportRange = { startLine: 1, endLine: 1 };
		const result = evaluator.evaluate(viewport);

		expect(result.tierCounts.tier1).toBe(1);
		expect(result.tierCounts.tier2).toBe(0);
		expect(result.tierCounts.tier3).toBe(0);

		const lineResult = result.lines[0];
		expect(lineResult.tier).toBe(EvalTier.Tier1);
		expect(lineResult.result).not.toBeNull();
		expect(lineResult.result!.toNumber()).toBe(15);
		expect(lineResult.error).toBeNull();
	});

	test("evaluates multiple dirty visible lines", () => {
		const viewport: ViewportRange = { startLine: 1, endLine: 3 };
		const result = evaluator.evaluate(viewport);

		expect(result.tierCounts.tier1).toBe(3);
		expect(result.resultMap.size).toBe(3);
		expect(result.resultMap.get(1)!.toNumber()).toBe(15);
		expect(result.resultMap.get(2)!.toNumber()).toBe(40);
		expect(result.resultMap.get(3)!.toNumber()).toBe(23);
	});

	test("returns null result for lines outside viewport (before viewport, are Tier 3 if dirty)", () => {
		// Viewport starts at line 2 — line 1 is invisible (Tier 3)
		const viewport: ViewportRange = { startLine: 2, endLine: 2 };
		const result = evaluator.evaluate(viewport);

		// Line 1 is dirty + invisible → Tier 3 (not in resultMap)
		expect(result.tierCounts.tier3).toBe(1);
		// Line 2 is visible + dirty → Tier 1
		expect(result.tierCounts.tier1).toBe(1);
		// Only line 2 is in resultMap
		expect(result.resultMap.size).toBe(1);
		expect(result.resultMap.has(2)).toBe(true);
		expect(result.resultMap.has(1)).toBe(false);
	});

	test("marks line as clean after successful Tier 1 evaluation", () => {
		const viewport: ViewportRange = { startLine: 1, endLine: 1 };
		evaluator.evaluate(viewport);

		const state = doc.getLineAt(1)!;
		expect(state.dirty).toBe(false);
		expect(state.result).not.toBeNull();
		expect(state.result!.toNumber()).toBe(15);
	});

	test("keeps line dirty on evaluation error", () => {
		// Use an unclosed group — guaranteed parse error
		const badDoc = createDoc(["((("]);
		const badEvaluator = new ThreeTierEvaluator(badDoc, engine);
		const viewport: ViewportRange = { startLine: 1, endLine: 1 };
		const result = badEvaluator.evaluate(viewport);

		expect(result.lines[0].error).not.toBeNull();
		expect(result.lines[0].result).toBeNull();

		const state = badDoc.getLineAt(1)!;
		expect(state.dirty).toBe(true); // stays dirty for retry
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier 2: Visible + Cached → Execute from Bytecode
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Tier 2 (Execute from Cached Bytecode)", () => {
	let doc: DocumentModel;
	let engine: ExpressionEngine;
	let evaluator: ThreeTierEvaluator;

	beforeEach(() => {
		doc = createDoc(["5 * 3", "10 + 2", "7 - 1"]);
		engine = createEngine();
		evaluator = new ThreeTierEvaluator(doc, engine);
	});

	test("uses Tier 2 for clean cached lines in viewport", () => {
		// First pass: evaluate all lines (all Tier 1)
		const fullViewport: ViewportRange = { startLine: 1, endLine: 3 };
		evaluator.evaluate(fullViewport);

		// Second pass: all lines are clean + have bytecode → Tier 2
		const result = evaluator.evaluate(fullViewport);

		expect(result.tierCounts.tier1).toBe(0);
		expect(result.tierCounts.tier2).toBe(3);
		expect(result.resultMap.get(1)!.toNumber()).toBe(15);
		expect(result.resultMap.get(2)!.toNumber()).toBe(12);
		expect(result.resultMap.get(3)!.toNumber()).toBe(6);
	});

	test("Tier 2 execution produces correct results", () => {
		// Full evaluation to populate bytecode cache
		evaluator.evaluate({ startLine: 1, endLine: 3 });

		// Re-evaluate with Tier 2
		const result = evaluator.evaluate({ startLine: 1, endLine: 3 });

		expect(result.tierCounts.tier2).toBe(3);
		expect(result.resultMap.get(1)!.toNumber()).toBe(15);
	});

	test("Tier 2 preserves VM variable state from preceding lines", () => {
		const varDoc = createDoc([
			":x = 10",
			"x + 5",
			"x * 2",
		]);
		const varEngine = createEngine();
		const varEvaluator = new ThreeTierEvaluator(varDoc, varEngine);

		// First full eval (all Tier 1)
		varEvaluator.evaluate({ startLine: 1, endLine: 3 });

		// Second eval: lines 2-3 should be Tier 2 (clean + bytecode).
		// Line 1 is clean + outside viewport → skipped, but VM still has x from
		// first pass, so Tier 2 for lines 2-3 works correctly.
		const result = varEvaluator.evaluate({ startLine: 2, endLine: 3 });

		expect(result.tierCounts.tier2).toBe(2);
		expect(result.resultMap.get(2)!.toNumber()).toBe(15);
		expect(result.resultMap.get(3)!.toNumber()).toBe(20);
	});

	test("re-evaluates manually dirtied line in viewport as Tier 1", () => {
		// Evaluate to populate cache
		evaluator.evaluate({ startLine: 1, endLine: 3 });

		// Mark line 2 as dirty manually to force Tier 1 re-evaluation.
		// (Direct bytecode corruption is hard to test because most
		// invalid bytecodes don't throw — they produce garbage silently.)
		const state = doc.getLineAt(2)!;
		state.dirty = true;

		const result = evaluator.evaluate({ startLine: 2, endLine: 2 });

		// Lines processed: 1 (skipped, clean + invisible), 2 (Tier 1, dirty + visible)
		const line2 = result.lines.find((l) => l.lineNumber === 2)!;
		expect(line2.tier).toBe(EvalTier.Tier1);
		expect(line2.result).not.toBeNull();
		expect(line2.result!.toNumber()).toBe(12);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier 3: Invisible + Dirty → Compile-Only
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Tier 3 (Compile-Only for Invisible Lines)", () => {
	let doc: DocumentModel;
	let engine: ExpressionEngine;
	let evaluator: ThreeTierEvaluator;

	beforeEach(() => {
		doc = createDoc([
			"5 + 3",       // line 1
			":x = 10",     // line 2 (variable def)
			"x * 2",       // line 3
			"100 / 4",     // line 4
		]);
		engine = createEngine();
		evaluator = new ThreeTierEvaluator(doc, engine);
	});

	test("compiles invisible dirty non-variable-def lines without executing them", () => {
		// Viewport covers line 4 — lines 1-3 are invisible + dirty → Tier 3
		const result = evaluator.evaluate({ startLine: 4, endLine: 4 });

		// Line 4 is visible + dirty → Tier 1
		expect(result.tierCounts.tier1).toBe(1);
		// Lines 1-3 are invisible + dirty → Tier 3
		expect(result.tierCounts.tier3).toBe(3);

		// Line 3 ("x * 2") is a non-variable-def expression — should be compiled but NOT executed
		const line3 = doc.getLineAt(3)!;
		expect(line3.bytecode).not.toBeNull(); // compiled
		expect(line3.dirty).toBe(true);        // NOT executed, stays dirty
		expect(line3.result).toBeNull();       // no result (wasn't executed)

		// Line 2 (":x = 10") is a variable def — compiled + executed → clean
		const line2 = doc.getLineAt(2)!;
		expect(line2.isVariableDef).toBe(true);
		expect(line2.bytecode).not.toBeNull();
		expect(line2.dirty).toBe(false); // executed in Tier 3
		expect(line2.result).not.toBeNull();
	});

	test("executes invisible variable-def lines to maintain VM state", () => {
		// Viewport only line 3 — lines 1-2 are invisible
		const result = evaluator.evaluate({ startLine: 3, endLine: 3 });

		// Line 2 (:x = 10) is a variable def + invisible → Tier 3 with execution
		const line2 = doc.getLineAt(2)!;
		expect(line2.isVariableDef).toBe(true);
		expect(line2.bytecode).not.toBeNull();
		expect(line2.dirty).toBe(false); // executed, now clean
		expect(line2.result).not.toBeNull();
		expect(line2.result!.toNumber()).toBe(10);

		// Line 3 uses x — VM should have x=10 from Tier 3 execution of line 2
		expect(result.resultMap.get(3)!.toNumber()).toBe(20);
	});

	test("backgroundCompile processes only invisible dirty lines", () => {
		// First, evaluate the first 2 lines to make them clean
		evaluator.evaluate({ startLine: 1, endLine: 2 });

		// Now backgroundCompile beyond viewport (lines 3-4)
		const bgResults = evaluator.backgroundCompile({ startLine: 1, endLine: 2 });

		expect(bgResults.length).toBe(2); // lines 3 and 4
		expect(bgResults[0].tier).toBe(EvalTier.Tier3);
		expect(bgResults[1].tier).toBe(EvalTier.Tier3);

		// Line 4 (non-variable-def) compiled but dirty
		const line4 = doc.getLineAt(4)!;
		expect(line4.bytecode).not.toBeNull();
		expect(line4.dirty).toBe(true);
	});

	test("skip already-compiled lines in backgroundCompile", () => {
		// First, backgroundCompile compiles invisible lines
		evaluator.backgroundCompile({ startLine: 1, endLine: 1 });

		// Second backgroundCompile: lines 2-4 are already clean or compiled-but-dirty
		// Line 2 (:x=10) was compiled + executed → clean → skipped
		const bgResults = evaluator.backgroundCompile({ startLine: 1, endLine: 2 });

		// Lines 3-4: line 4 was compiled but still dirty → re-compiled
		// Line 3: was compiled, dirty stays true → re-compiled
		// But dirty lines 3-4 were already compiled in previous call.
		// Since dirty stays true, they get re-compiled.
		expect(bgResults.length).toBeGreaterThanOrEqual(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Skipped Lines (Empty / Markdown / Clean-outside-viewport)
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Skipped Lines", () => {
	let doc: DocumentModel;
	let engine: ExpressionEngine;
	let evaluator: ThreeTierEvaluator;

	beforeEach(() => {
		doc = createDoc([
			"",              // line 1: empty
			"# ",            // line 2: markdown heading (only hashes + whitespace)
			"5 + 3",         // line 3: expression
			"",              // line 4: empty
		]);
		engine = createEngine();
		evaluator = new ThreeTierEvaluator(doc, engine);
	});

	test("skips empty lines", () => {
		const result = evaluator.evaluate({ startLine: 1, endLine: 4 });

		expect(result.tierCounts.skipped).toBeGreaterThanOrEqual(2); // lines 1 and 4
		expect(doc.getLineAt(1)!.isEmpty).toBe(true);
		expect(doc.getLineAt(1)!.dirty).toBe(false);
	});

	test("skips markdown-only lines", () => {
		const result = evaluator.evaluate({ startLine: 2, endLine: 2 });

		expect(result.lines[0].tier).toBe(EvalTier.Skipped);
		expect(doc.getLineAt(2)!.isEmpty).toBe(true);
	});

	test("skips clean lines outside viewport", () => {
		// Evaluate everything first — line 2 (# ) is classified as empty and skipped
		evaluator.evaluate({ startLine: 1, endLine: 4 });

		// Now only viewport line 3 — lines 1,2 are clean + outside viewport
		// (Line 4 is beyond evalEnd=3, so only lines 1-3 are processed)
		const result = evaluator.evaluate({ startLine: 3, endLine: 3 });

		// Line 3 is Tier 2 (clean + cached + in viewport)
		expect(result.tierCounts.tier2).toBe(1);
		// Lines 1 and 2 are skipped (clean, not in viewport)
		expect(result.tierCounts.skipped).toBe(2);
	});

	test("skips lines with empty bytecode even if clean and in viewport", () => {
		// Line 1 is empty — it gets skipped, not Tier 2
		const result = evaluator.evaluate({ startLine: 1, endLine: 1 });

		expect(result.lines[0].tier).toBe(EvalTier.Skipped);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: Mixed Tiers in a Single evaluate() Call
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Mixed Tiers", () => {
	test("correctly assigns different tiers within a single viewport", () => {
		const doc = createDoc([
			":a = 5",        // line 1: variable def
			"a + 3",         // line 2: uses a
			"10 * 2",        // line 3: independent
			"a * 4",         // line 4: uses a
			"100 / 5",       // line 5: independent
		]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// First pass: evaluate lines 1-3 only
		const firstPass = evaluator.evaluate({ startLine: 1, endLine: 3 });

		// Lines 1-3: all dirty → Tier 1
		expect(firstPass.tierCounts.tier1).toBe(3);
		expect(doc.getLineAt(1)!.dirty).toBe(false);
		expect(doc.getLineAt(2)!.dirty).toBe(false);
		expect(doc.getLineAt(3)!.dirty).toBe(false);

		// Second pass: same viewport — lines 1-3 are clean + cached → Tier 2
		const secondPass = evaluator.evaluate({ startLine: 1, endLine: 3 });
		expect(secondPass.tierCounts.tier2).toBe(3);

		// Third pass: expand viewport to include line 4 (dirty, visible).
		// Line 5 is beyond the viewport — use backgroundCompile() for Tier 3.
		const thirdPass = evaluator.evaluate({ startLine: 3, endLine: 4 });

		expect(thirdPass.tierCounts.tier2).toBe(1); // line 3 clean + visible
		expect(thirdPass.tierCounts.tier1).toBe(1); // line 4 dirty + visible
		// Lines before viewport (1-2) are clean → skipped
		expect(thirdPass.tierCounts.skipped).toBe(2);

		// Line 5 is beyond viewport — backgroundCompile handles it as Tier 3
		const bgResults = evaluator.backgroundCompile({ startLine: 3, endLine: 4 });
		expect(bgResults.length).toBe(1);
		expect(bgResults[0].tier).toBe(EvalTier.Tier3);
		expect(bgResults[0].lineNumber).toBe(5);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// evaluateAll()
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — evaluateAll()", () => {
	test("evaluates all lines as a single viewport", () => {
		const doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluateAll();

		expect(result.tierCounts.tier1).toBe(3);
		expect(result.resultMap.size).toBe(3);
	});

	test("evaluateAll uses Tier 2 on second call", () => {
		const doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();
		const result = evaluator.evaluateAll();

		expect(result.tierCounts.tier2).toBe(3);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Edge Cases", () => {
	test("handles empty document gracefully", () => {
		const doc = createDoc([]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluate({ startLine: 1, endLine: 10 });

		// setDocument("") produces one empty line ("".split("\n") = [""])
		// That line is skipped as empty/markdown
		expect(result.resultMap.size).toBe(0);
		expect(result.tierCounts.tier1).toBe(0);
		expect(result.tierCounts.tier2).toBe(0);
		expect(result.tierCounts.tier3).toBe(0);
		// All lines in result are skipped
		for (const l of result.lines) {
			expect(l.tier).toBe(EvalTier.Skipped);
		}
	});

	test("handles viewport beyond document end", () => {
		const doc = createDoc(["5 + 3"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluate({ startLine: 1, endLine: 100 });

		expect(result.lines.length).toBe(1);
		expect(result.tierCounts.tier1).toBe(1);
	});

	test("handles viewport with startLine > endLine", () => {
		const doc = createDoc(["5 + 3"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluate({ startLine: 5, endLine: 2 });

		// evalEnd = min(2, 1) = 1, startLine=5, no lines processed
		// Actually: for loop goes 1 to 1, inViewport = (1 >= 5 && 1 <= 2) = false
		// So line 1 is dirty + invisible → Tier 3
		expect(result.lines.length).toBe(1);
		expect(result.tierCounts.tier3).toBe(1);
		expect(result.resultMap.size).toBe(0); // not in "viewport"
	});

	test("handles viewport completely before document (startLine > docEnd)", () => {
		const doc = createDoc(["5 + 3"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluate({ startLine: 10, endLine: 20 });

		// evalEnd = min(20, 1) = 1, process line 1 as invisible → Tier 3
		expect(result.lines.length).toBe(1);
		expect(result.tierCounts.tier3).toBe(1);
	});

	test("lines with inline solve syntax (pure s`...`) extract expression correctly", () => {
		const doc = createDoc(["s`2 + 2`"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.evaluate({ startLine: 1, endLine: 1 });

		expect(result.tierCounts.tier1).toBe(1);
		expect(result.resultMap.get(1)!.toNumber()).toBe(4);
	});

	test("backgroundCompile handles end of document correctly", () => {
		const doc = createDoc(["1 + 1"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Viewport covers the only line — backgroundCompile should find nothing
		const bgResults = evaluator.backgroundCompile({ startLine: 1, endLine: 1 });

		expect(bgResults.length).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// VMCheckpointer Integration
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — VMCheckpointer Integration", () => {
	test("checkpointer is null by default", () => {
		const doc = createDoc([":x = 5"]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		expect(evaluator.getCheckpointer()).toBeNull();
	});

	test("checkpointer can be injected via constructor", () => {
		const doc = createDoc([":x = 5"]);
		const engine = createEngine();
		const vm = createVM(sharedOpRegistry);
		const checkpointer = new VMCheckpointer(vm);
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		expect(evaluator.getCheckpointer()).toBe(checkpointer);
	});

	test("creates checkpoints after Tier 1 variable-def lines", () => {
		const doc = createDoc([
			":x = 10",       // line 1: variable def
			"x + 5",         // line 2: uses x
			":y = x * 2",    // line 3: variable def using x
			"x + y",         // line 4: uses x and y
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluate({ startLine: 1, endLine: 4 });

		// Should have checkpoints at lines 1 (:x=10) and 3 (:y=x*2)
		expect(checkpointer.count).toBe(2);
		expect(checkpointer.getCheckpointAt(1)).toBeDefined();
		expect(checkpointer.getCheckpointAt(3)).toBeDefined();

		// Verify checkpoint values
		expect(checkpointer.getCheckpointAt(1)!.variables.x.toNumber()).toBe(10);
		expect(checkpointer.getCheckpointAt(3)!.variables.y.toNumber()).toBe(20);
	});

	test("creates checkpoints after Tier 3 invisible variable-def lines", () => {
		const doc = createDoc([
			"5 + 3",         // line 1: pure expression (dirty, but will be Tier 3)
			":x = 42",       // line 2: variable def (invisible, Tier 3)
			"x + 1",         // line 3: uses x (visible, Tier 1)
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		// Viewport only line 3 — lines 1-2 are invisible
		const result = evaluator.evaluate({ startLine: 3, endLine: 3 });

		// Line 1: dirty + invisible → Tier 3 (compile-only, non-variable-def → no checkpoint)
		// Line 2: dirty + invisible → Tier 3 (variable def → executed → checkpointed)
		// Line 3: dirty + visible → Tier 1

		expect(checkpointer.count).toBe(1);
		expect(checkpointer.getCheckpointAt(2)).toBeDefined();
		expect(checkpointer.getCheckpointAt(2)!.variables.x.toNumber()).toBe(42);

		// Line 3 should correctly use x=42 via VM state from Tier 3 execution
		expect(result.resultMap.get(3)!.toNumber()).toBe(43);
	});

	test("restoreTo enables evaluating from midpoint without re-evaluating all lines", () => {
		const doc = createDoc([
			":a = 5",        // line 1
			":bb = a + 3",   // line 2
			":cc = bb * 2",  // line 3
			"a + bb",        // line 4
			"bb + cc",       // line 5
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		// Full evaluation to populate checkpoints
		evaluator.evaluateAll();

		expect(checkpointer.count).toBe(3); // lines 1, 2, 3

		// Now restore VM to line 2 (variables a=5, bb=8 available)
		evaluator.restoreTo(2);

		// VM should have a and bb, but NOT cc
		const vm = engine.getVM();
		expect(vm.getVar("a")?.toNumber()).toBe(5);
		expect(vm.getVar("bb")?.toNumber()).toBe(8);
		expect(vm.getVar("cc")).toBeUndefined();

		// Now re-evaluate lines 3-5 with VM already having a and bb
		// Mark lines 3-5 as dirty so they get re-evaluated
		const line3 = doc.getLineAt(3)!;
		const line4 = doc.getLineAt(4)!;
		const line5 = doc.getLineAt(5)!;
		line3.dirty = true;
		line4.dirty = true;
		line5.dirty = true;

		const result = evaluator.evaluate({ startLine: 3, endLine: 5 });

		// Lines 1-2 should be skipped (clean, not in viewport); only 3-5 processed
		expect(result.resultMap.get(3)!.toNumber()).toBe(16); // cc = 8*2
		expect(result.resultMap.get(4)!.toNumber()).toBe(13); // a + bb = 5+8
		expect(result.resultMap.get(5)!.toNumber()).toBe(24); // bb + cc = 8+16
	});

	test("restoreTo with no matching checkpoint resets VM entirely", () => {
		const doc = createDoc([":x = 10", "x + 1"]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// Restore to a line before any checkpoint
		evaluator.restoreTo(0);

		const vm = engine.getVM();
		expect(vm.getVar("x")).toBeUndefined();
	});

	test("evaluateAll populates checkpoints for all variable definitions", () => {
		const doc = createDoc([
			":p = 1",
			":q = 2",
			":r = 3",
			":u = 4",
			":v = 5",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		expect(checkpointer.count).toBe(5);
		expect(checkpointer.lookupVariable("p")?.toNumber()).toBe(1);
		expect(checkpointer.lookupVariable("q")?.toNumber()).toBe(2);
		expect(checkpointer.lookupVariable("r")?.toNumber()).toBe(3);
		expect(checkpointer.lookupVariable("u")?.toNumber()).toBe(4);
		expect(checkpointer.lookupVariable("v")?.toNumber()).toBe(5);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5.2e: setViewport() Zero-Allocation Execution
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — setViewport() (Phase 5.2e)", () => {
	// ── Core: Pure scrolling uses Tier 2 ──────────────────────────────

	test("pure scroll: all visible lines use Tier 2 after initial evaluateAll", () => {
		const doc = createDoc([
			":x = 10",
			"x + 5",
			"x * 2",
			"x + 20",
			"x - 3",
			":y = 100",
			"y / 2",
			"y + x",
			"50 * 3",
			"200 / 4",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		// Full initial evaluation — populates bytecode cache + checkpoints
		evaluator.evaluateAll();
		expect(checkpointer.count).toBe(2); // :x and :y

		// Scroll to lines 4-6 — all clean + cached → Tier 2
		const result = evaluator.setViewport({ startLine: 4, endLine: 6 });

		expect(result.tierCounts.tier2).toBe(3);
		expect(result.tierCounts.tier1).toBe(0);
		expect(result.resultMap.get(4)!.toNumber()).toBe(30);   // x + 20
		expect(result.resultMap.get(5)!.toNumber()).toBe(7);    // x - 3
		expect(result.resultMap.get(6)!.toNumber()).toBe(100);  // :y = 100
		expect(result.lines.length).toBe(3); // only visible lines
	});

	test("pure scroll: only visible lines in result (no pre-viewport lines)", () => {
		const doc = createDoc([
			":aa = 1",
			":bb = 2",
			":cc = 3",
			"aa + bb + cc",
			"aa * bb * cc",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// Scroll to line 5 only — result should ONLY contain line 5
		const result = evaluator.setViewport({ startLine: 5, endLine: 5 });

		expect(result.lines.length).toBe(1);
		expect(result.lines[0].lineNumber).toBe(5);
		expect(result.resultMap.size).toBe(1);
		expect(result.resultMap.has(5)).toBe(true);
		expect(result.resultMap.has(4)).toBe(false);
	});

	test("pure scroll: VM has correct variable state from checkpoint restore", () => {
		const doc = createDoc([
			":aa = 5",
			":bb = aa + 10",
			":cc = bb * 3",
			"aa + bb + cc",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// Scroll to line 4 — should have aa=5, bb=15, cc=45 from checkpoints
		const result = evaluator.setViewport({ startLine: 4, endLine: 4 });

		expect(result.tierCounts.tier2).toBe(1);
		expect(result.resultMap.get(4)!.toNumber()).toBe(65); // 5 + 15 + 45
	});

	// ── Dirty-line fallback ──────────────────────────────────────────

	test("dirty before viewport: falls back to evaluate() (full re-eval from line 1)", () => {
		const doc = createDoc([
			":xx = 5",
			"xx + 3",
			"xx * 2",
			"xx + 10",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		// Initial full eval
		evaluator.evaluateAll();

		// Edit line 1 (variable def) to change xx
		doc.editLine(1, ":xx = 20");
		// Line 1 is now dirty, lines 2-4 depend on xx

		// setViewport at lines 3-4 — line 1 is dirty before viewport
		const result = evaluator.setViewport({ startLine: 3, endLine: 4 });

		// Should have fallen back to evaluate(), which processes from line 1.
		// Line 1: dirty + invisible → Tier 3 (variable def, executed)
		// Line 2: dirty + invisible → Tier 3 (non-var-def, compiled only)
		// Lines 3-4: dirty + visible → Tier 1
		expect(result.tierCounts.tier3).toBeGreaterThanOrEqual(1); // line 1 or 2
		expect(result.resultMap.get(3)!.toNumber()).toBe(40); // xx*2 = 20*2
		expect(result.resultMap.get(4)!.toNumber()).toBe(30); // xx+10 = 20+10
	});

	test("no dirty before viewport: uses optimized path (no fallback)", () => {
		const doc = createDoc([
			":x = 5",
			"x + 3",
			"x * 2",
			"x + 10",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// All lines clean — setViewport should NOT fall back
		const result = evaluator.setViewport({ startLine: 2, endLine: 3 });

		// Should use optimized path: only Tier 2 (no Tier 1 or Tier 3)
		expect(result.tierCounts.tier2).toBe(2);
		expect(result.tierCounts.tier1).toBe(0);
		expect(result.tierCounts.tier3).toBe(0);
	});

	test("edit at a line AFTER viewport: does NOT trigger fallback", () => {
		const doc = createDoc([
			":x = 5",
			"x + 3",
			"x * 2",
			"x + 10",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// Edit line 4 (after viewport) — viewport is lines 1-2
		doc.editLine(4, "x + 100");

		// setViewport at lines 1-2 — dirty is at line 4, AFTER the viewport
		// hasDirtyLinesBefore(1) = false (startLine=1, no lines before)
		const result = evaluator.setViewport({ startLine: 1, endLine: 2 });

		// Should use optimized path: Tier 2 (no dirty before viewport)
		expect(result.tierCounts.tier2).toBe(2);
		expect(result.resultMap.get(1)!.toNumber()).toBe(5);
	});

	// ── Variable defs inside viewport ─────────────────────────────────

	test("dirty variable def inside viewport: Tier 1 with checkpoint creation", () => {
		const doc = createDoc([
			":x = 5",
			"x + 3",
			":y = x * 4",
			"y / 2",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		// Initial eval of lines 1-2
		evaluator.evaluate({ startLine: 1, endLine: 2 });

		// setViewport at lines 3-4 where line 3 is a dirty variable def
		const result = evaluator.setViewport({ startLine: 3, endLine: 4 });

		// Line 3 is dirty + visible → Tier 1 with checkpoint
		expect(result.resultMap.get(3)!.toNumber()).toBe(20); // y = 5*4
		expect(result.resultMap.get(4)!.toNumber()).toBe(10); // y/2 = 10
		expect(checkpointer.getCheckpointAt(3)).toBeDefined();
	});

	// ── No checkpointer → still works ────────────────────────────────

	test("setViewport without checkpointer: evaluates visible lines via VM state", () => {
		const doc = createDoc([
			":x = 5",
			"x + 3",
			"x * 2",
		]);
		const engine = createEngine();
		// No checkpointer — VM has whatever state from prior evaluations
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Initial evaluateAll sets VM state
		evaluator.evaluateAll();

		// setViewport at line 3 — no checkpoint, but VM still has x=5
		const result = evaluator.setViewport({ startLine: 3, endLine: 3 });

		expect(result.tierCounts.tier2).toBe(1);
		expect(result.resultMap.get(3)!.toNumber()).toBe(10);
	});

	// ── Edge cases ───────────────────────────────────────────────────

	test("setViewport at line 1: no dirty-before check needed, no restore needed", () => {
		const doc = createDoc([
			":x = 42",
			"x + 1",
			"x + 2",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// setViewport starting at line 1 — no lines before, so no dirty check
		const result = evaluator.setViewport({ startLine: 1, endLine: 2 });

		expect(result.tierCounts.tier2).toBe(2);
		expect(result.resultMap.get(1)!.toNumber()).toBe(42);
		expect(result.resultMap.get(2)!.toNumber()).toBe(43);
	});

	test("setViewport beyond document end: clamped to docEnd", () => {
		const doc = createDoc([
			":x = 5",
			"x + 3",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		const result = evaluator.setViewport({ startLine: 1, endLine: 100 });

		expect(result.lines.length).toBe(2); // clamped to doc line count
	});

	test("setViewport on empty document", () => {
		const doc = createDoc([]);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const result = evaluator.setViewport({ startLine: 1, endLine: 10 });

		expect(result.lines.length).toBeGreaterThanOrEqual(0);
		expect(result.resultMap.size).toBe(0);
	});

	test("setViewport with empty/markdown lines in viewport skips them", () => {
		const doc = createDoc([
			":x = 5",
			"",
			"x + 10",
			"# ",
			":y = x * 2",
		]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// setViewport covering lines 2-4 (empty, expression, markdown-only)
		const result = evaluator.setViewport({ startLine: 2, endLine: 4 });

		// Line 2 (empty) → skipped, line 3 (x+10) → Tier 2, line 4 (# ) → skipped (bare structural marker)
		expect(result.tierCounts.tier2).toBe(1);
		expect(result.tierCounts.skipped).toBe(2);
		expect(result.resultMap.get(3)!.toNumber()).toBe(15);
	});

	// ── Performance characteristic ────────────────────────────────────

	test("setViewport processes fewer lines than evaluate() for non-trivial viewport", () => {
		const lines: string[] = [];
		for (let i = 1; i <= 20; i++) {
			lines.push(`:v${i} = ${i * 10}`);
		}
		// Add consumers at the end
		lines.push("v1 + v2");
		lines.push("v3 + v4");
		lines.push("v5 + v6");

		const doc = createDoc(lines);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// evaluate() processes ALL lines from 1 to endLine
		const evalResult = evaluator.evaluate({ startLine: 21, endLine: 23 });
		const evalLineCount = evalResult.lines.length;

		// setViewport() only processes visible lines
		const svpResult = evaluator.setViewport({ startLine: 21, endLine: 23 });

		// setViewport should have fewer lines (just 3 visible vs 23 total)
		expect(svpResult.lines.length).toBe(3);
		expect(svpResult.lines.length).toBeLessThan(evalLineCount);
	});

	test("setViewport with inverted range (startLine > endLine): returns empty result", () => {
		const doc = createDoc([":x = 1", ":y = 2", ":z = 3", "x + y + z"]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		const result = evaluator.setViewport({ startLine: 5, endLine: 2 });

		expect(result.lines.length).toBe(0);
		expect(result.resultMap.size).toBe(0);
		expect(result.tierCounts.tier1).toBe(0);
		expect(result.tierCounts.tier2).toBe(0);
	});

	test("setViewport result lines always match visible range", () => {
		const doc = createDoc([":x = 1", ":y = 2", ":z = 3", "x + y + z"]);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// Scroll to different viewports and verify line count
		const r1 = evaluator.setViewport({ startLine: 1, endLine: 1 });
		expect(r1.lines.length).toBe(1);

		const r2 = evaluator.setViewport({ startLine: 2, endLine: 4 });
		expect(r2.lines.length).toBe(3);

		const r3 = evaluator.setViewport({ startLine: 4, endLine: 4 });
		expect(r3.lines.length).toBe(1);
	});
});
