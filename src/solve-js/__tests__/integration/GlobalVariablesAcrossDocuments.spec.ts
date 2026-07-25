import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { DocumentModel, ViewportRange } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator, EvalTier } from "@solve-js/engine/ThreeTierEvaluator";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType, numberValue } from "@solve-js/vm/Value";
import { sharedGlobalVariableStore, globalDagKey } from "@solve-js/vm/GlobalVariableStore";

/**
 * Airtight, adversarial coverage for `global :name` across MULTIPLE
 * simultaneously "open" documents — the engine-level analog of what the
 * playground's multi-tab UI lets a human poke at by hand. Every "document"
 * here is a full DocumentModel + ExpressionEngine + ThreeTierEvaluator
 * triple, constructed directly, no UI involved — mirroring the style
 * already established by StructuralEditLineTracking.spec.ts and
 * CacheCoherence.spec.ts this session.
 *
 * Three cooperating pieces are under test together:
 * - GlobalVariableStore (the process-wide value store + notify)
 * - GlobalVariableAsyncResolver (first-resolution: Pending -> real value,
 *   reused from the exact async pipeline currency/OSRS already use)
 * - ThreeTierEvaluator's sharedGlobalVariableStore subscription (ongoing
 *   propagation: a line that already has a real value goes dirty again
 *   when the global it reads changes elsewhere — "dealing with the DAG
 *   across pages")
 *
 * sharedGlobalVariableStore is a module-level singleton — every test MUST
 * clear it in beforeEach/afterEach, or state and listeners leak across
 * test cases.
 */

function createEngine(): ExpressionEngine {
	return new ExpressionEngine("en", false);
}

function fullViewport(doc: DocumentModel): ViewportRange {
	return { startLine: 1, endLine: doc.lineCount };
}

interface Doc {
	doc: DocumentModel;
	engine: ExpressionEngine;
	evaluator: ThreeTierEvaluator;
}

/** Creates one "open document" — a full DocumentModel+Engine+Evaluator triple. */
function createDocument(lines: string[]): Doc {
	const doc = new DocumentModel();
	doc.setDocument(lines.join("\n"));
	const engine = createEngine();
	const evaluator = new ThreeTierEvaluator(doc, engine);
	return { doc, engine, evaluator };
}

/** Evaluates the whole document and returns the per-line result map. */
function evalAll(d: Doc) {
	return d.evaluator.evaluate(fullViewport(d.doc));
}

/** Closes a document — unsubscribes from sharedGlobalVariableStore. */
function closeDocument(d: Doc): void {
	d.evaluator.terminateWorker();
}

describe("Global variables across documents", () => {
	beforeEach(() => {
		sharedGlobalVariableStore.clear();
	});

	afterEach(() => {
		sharedGlobalVariableStore.clear();
	});

	// ── 1. Declare-then-read across two docs ──────────────────────────

	test("doc A declares a global, doc B (already open) reads the correct value", () => {
		const docA = createDocument(["global :widgetCost = 100"]);
		evalAll(docA);

		const docB = createDocument(["global :widgetCost + 1"]);
		const resultB = evalAll(docB);

		expect(resultB.resultMap.get(1)![0].toNumber()).toBe(101);

		closeDocument(docA);
		closeDocument(docB);
	});

	// ── 2. Read-before-declare: Pending, then resolves automatically ──

	test("doc B reads an undeclared global (Pending), then resolves once doc A declares it — no manual re-evaluate needed to become resolvable", () => {
		const docB = createDocument(["global :widgetCost + 1"]);
		const first = evalAll(docB);
		expect(first.resultMap.get(1)![0].type).toBe(ValueType.Pending);

		const docA = createDocument(["global :widgetCost = 100"]);
		evalAll(docA); // triggers docB's subscription -> marks docB's line 1 dirty

		expect(docB.doc.getLineAt(1)!.dirty).toBe(true);

		const second = evalAll(docB);
		expect(second.resultMap.get(1)![0].type).not.toBe(ValueType.Pending);
		expect(second.resultMap.get(1)![0].toNumber()).toBe(101);

		closeDocument(docA);
		closeDocument(docB);
	});

	// ── 3. Last-write-wins across 3+ docs ──────────────────────────────

	test("last-write-wins across three documents, regardless of write order", () => {
		const docA = createDocument(["global :x = 1"]);
		const docB = createDocument(["global :x = 2"]);
		const docC = createDocument(["global :x = 3"]);

		evalAll(docA);
		evalAll(docB);
		evalAll(docC);

		const reader = createDocument(["global :x"]);
		const result = evalAll(reader);
		expect(result.resultMap.get(1)![0].toNumber()).toBe(3);

		closeDocument(docA);
		closeDocument(docB);
		closeDocument(docC);
		closeDocument(reader);
	});

	// ── 4. DAG propagation for an ALREADY-RESOLVED global that changes ──

	test("a line with an already-resolved global value goes dirty and re-evaluates when the global changes in another document", () => {
		const docA = createDocument(["global :widgetCost = 100"]);
		evalAll(docA);

		const docB = createDocument(["global :widgetCost + 1"]);
		const before = evalAll(docB);
		expect(before.resultMap.get(1)![0].toNumber()).toBe(101);
		expect(docB.doc.getLineAt(1)!.dirty).toBe(false);

		// doc A writes a NEW value.
		docA.doc.editLine(1, "global :widgetCost = 500");
		evalAll(docA);

		expect(docB.doc.getLineAt(1)!.dirty).toBe(true);

		const after = evalAll(docB);
		expect(after.resultMap.get(1)![0].toNumber()).toBe(501);

		closeDocument(docA);
		closeDocument(docB);
	});

	// ── 5. Local :name and global :name don't collide in the same doc ──

	test("a local :name and a global :name of the same identifier in ONE document don't collide", () => {
		const docA = createDocument(["global :x = 2"]);
		evalAll(docA);

		const docB = createDocument([":x = 1", "global :x"]);
		const result = evalAll(docB);

		expect(result.resultMap.get(1)![0].toNumber()).toBe(1); // local :x, untouched
		expect(result.resultMap.get(2)![0].toNumber()).toBe(2); // global :x, from doc A

		expect(docB.engine.getDag().getWrites(1)).toContain("x");
		// getDependencies() is only populated for WRITE lines (tracks "what
		// does this line's write depend on") — line 2 is a pure read, so the
		// right check is the reverse direction: is line 2 registered as a
		// CONSUMER of globalDagKey("x"), and NOT a consumer of plain "x"
		// (which is what a local :x read would register under instead).
		expect(docB.engine.getDag().getConsumers(globalDagKey("x")).has(2)).toBe(true);
		expect(docB.engine.getDag().getConsumers("x").has(2)).toBe(false);

		closeDocument(docA);
		closeDocument(docB);
	});

	// ── 6. Disposal/unsubscribe correctness ─────────────────────────────

	test("closing a document stops it from being notified of later global writes", () => {
		const docA = createDocument(["global :x = 1"]);
		evalAll(docA);

		const docB = createDocument(["global :x + 1"]);
		evalAll(docB);
		expect(docB.doc.getLineAt(1)!.dirty).toBe(false);

		closeDocument(docB);

		docA.doc.editLine(1, "global :x = 2");
		evalAll(docA);

		// docB was closed — its subscription is gone, so its (already-clean)
		// line must NOT be marked dirty by this later write.
		expect(docB.doc.getLineAt(1)!.dirty).toBe(false);

		closeDocument(docA);
	});

	// ── 7. Chain propagation: A -> B -> C ────────────────────────────────

	test("a chain of global writes propagates through multiple documents", () => {
		const docA = createDocument(["global :g1 = 1"]);
		evalAll(docA);

		// doc B reads g1 and, when re-evaluated, writes g2 derived from it.
		const docB = createDocument(["global :g2 = global :g1 + 10"]);
		evalAll(docB);
		expect(evalAll(docB).resultMap.get(1)![0].toNumber()).toBe(11);

		const docC = createDocument(["global :g2 + 100"]);
		expect(evalAll(docC).resultMap.get(1)![0].toNumber()).toBe(111);

		// Now change g1 — this should dirty docB's line (reads g1), and once
		// docB is RE-EVALUATED (writing a new g2), that should in turn dirty
		// docC's line (reads g2).
		docA.doc.editLine(1, "global :g1 = 5");
		evalAll(docA);
		expect(docB.doc.getLineAt(1)!.dirty).toBe(true);

		const docBResult = evalAll(docB);
		expect(docBResult.resultMap.get(1)![0].toNumber()).toBe(15);

		expect(docC.doc.getLineAt(1)!.dirty).toBe(true);
		const docCResult = evalAll(docC);
		expect(docCResult.resultMap.get(1)![0].toNumber()).toBe(115);

		closeDocument(docA);
		closeDocument(docB);
		closeDocument(docC);
	});

	// ── 8. Interleaved edits across docs converge correctly ────────────

	test("interleaved (not batched-per-document) writes across three docs converge to the true final write order", () => {
		const docA = createDocument(["global :shared = 0"]);
		const docB = createDocument(["global :shared = 0"]);
		const docC = createDocument(["global :shared"]);

		evalAll(docA);
		evalAll(docB);

		docA.doc.editLine(1, "global :shared = 1");
		evalAll(docA);
		docB.doc.editLine(1, "global :shared = 2");
		evalAll(docB);
		docA.doc.editLine(1, "global :shared = 3");
		evalAll(docA);

		const result = evalAll(docC);
		expect(result.resultMap.get(1)![0].toNumber()).toBe(3);

		closeDocument(docA);
		closeDocument(docB);
		closeDocument(docC);
	});

	// ── 9. A pending global resolves for MULTIPLE waiting documents ────

	test("two different documents both waiting on the same undeclared global both resolve once it's declared", () => {
		const docB = createDocument(["global :shared + 1"]);
		const docC = createDocument(["global :shared + 2"]);

		expect(evalAll(docB).resultMap.get(1)![0].type).toBe(ValueType.Pending);
		expect(evalAll(docC).resultMap.get(1)![0].type).toBe(ValueType.Pending);

		const docA = createDocument(["global :shared = 10"]);
		evalAll(docA);

		expect(docB.doc.getLineAt(1)!.dirty).toBe(true);
		expect(docC.doc.getLineAt(1)!.dirty).toBe(true);

		expect(evalAll(docB).resultMap.get(1)![0].toNumber()).toBe(11);
		expect(evalAll(docC).resultMap.get(1)![0].toNumber()).toBe(12);

		closeDocument(docA);
		closeDocument(docB);
		closeDocument(docC);
	});

	// ── 10. Reentrancy / cycle guard doesn't corrupt or hang ────────────

	test("a mutual write cycle across two documents doesn't hang or corrupt state", () => {
		let depth = 0;
		let maxDepth = 0;
		const unsubscribe = sharedGlobalVariableStore.subscribe((name, value) => {
			depth++;
			maxDepth = Math.max(maxDepth, depth);
			if (depth < 1000) {
				if (name === "cycleA") sharedGlobalVariableStore.set("cycleB", value);
				else if (name === "cycleB") sharedGlobalVariableStore.set("cycleA", value);
			}
			depth--;
		});

		expect(() => sharedGlobalVariableStore.set("cycleA", numberValue(0))).not.toThrow();
		expect(maxDepth).toBeLessThan(100);

		unsubscribe();
	});

	// ── 11. Reserved-keyword regression ─────────────────────────────────

	test("':global = 5' is a parse error, not a silently-defined local variable named 'global'", () => {
		const d = createDocument([":global = 5"]);
		const result = evalAll(d);
		// A failed expression still gets an errorValue() sentinel in
		// resultMap (see evaluateTier1) rather than no entry at all — the
		// meaningful assertion is that it's an Error type, not that the
		// entry is absent.
		expect(result.resultMap.get(1)![0].type).toBe(ValueType.Error);
		expect(result.lines[0].error).toBeTruthy();
		// And critically: no local variable named "global" was defined.
		expect(d.engine.getVM().getVar("global")).toBeUndefined();
		closeDocument(d);
	});

	// ── 12. Arena-persistence correctness across documents ──────────────

	test("a global stored during one document's evaluate() survives an unrelated evaluate() call on a different document", () => {
		const docA = createDocument(["global :persisted = 42"]);
		evalAll(docA); // arena-active during this evaluate() call

		// Unrelated evaluate() on a totally different document — allocates
		// fresh arena Values, would corrupt an un-persisted stored Value.
		const docB = createDocument(["1 + 1", "2 + 2", "3 + 3"]);
		evalAll(docB);

		const docC = createDocument(["global :persisted"]);
		expect(evalAll(docC).resultMap.get(1)![0].toNumber()).toBe(42);

		closeDocument(docA);
		closeDocument(docB);
		closeDocument(docC);
	});

	// ── 13. Regression: existing single-document :x semantics unaffected ──

	test("ordinary single-document local variables are completely unaffected by any of this", () => {
		const d = createDocument([":x = 10", ":y = :x + 5", ":x + :y"]);
		const result = evalAll(d);
		expect(result.resultMap.get(1)![0].toNumber()).toBe(10);
		expect(result.resultMap.get(2)![0].toNumber()).toBe(15);
		expect(result.resultMap.get(3)![0].toNumber()).toBe(25);
		closeDocument(d);
	});

	// ── Tier assignment sanity: global reads/writes still get real tiers ──

	test("a resolved global read is Tier 1 on first (dirty) evaluation, Tier 2 on a later clean revisit", () => {
		const docA = createDocument(["global :t = 1"]);
		evalAll(docA);

		const docB = createDocument(["global :t + 1"]);
		const first = evalAll(docB);
		expect(first.lines[0].tier).toBe(EvalTier.Tier1);

		const second = evalAll(docB);
		expect(second.lines[0].tier).toBe(EvalTier.Tier2);

		closeDocument(docA);
		closeDocument(docB);
	});
});
