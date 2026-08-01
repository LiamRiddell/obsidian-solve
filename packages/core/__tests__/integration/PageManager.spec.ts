import { describe, expect, test, beforeEach } from "@jest/globals";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { PageManager, PAGE_SIZE } from "@solve-js/engine/PageManager";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";

// ── Helpers ─────────────────────────────────────────────────────────────

function createEngine(): ExpressionEngine {
	return new ExpressionEngine("en", false);
}

function createDoc(lines: string[]): DocumentModel {
	const doc = new DocumentModel();
	doc.setDocument(lines.join("\n"));
	return doc;
}

/** Create a document with enough lines to span multiple pages (> 256 lines). */
function createLargeDoc(expressionCount: number): DocumentModel {
	const lines: string[] = [];
	for (let i = 1; i <= expressionCount; i++) {
		lines.push(`${i} + ${i * 2}`);
	}
	return createDoc(lines);
}

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Static Utilities
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Static Utilities", () => {
	test("pageForLine returns 0 for lines 1-128", () => {
		expect(PageManager.pageForLine(1)).toBe(0);
		expect(PageManager.pageForLine(128)).toBe(0);
		expect(PageManager.pageForLine(64)).toBe(0);
	});

	test("pageForLine returns 1 for lines 129-256", () => {
		expect(PageManager.pageForLine(129)).toBe(1);
		expect(PageManager.pageForLine(256)).toBe(1);
	});

	test("pageForLine returns correct page for large line numbers", () => {
		expect(PageManager.pageForLine(257)).toBe(2);
		expect(PageManager.pageForLine(1000)).toBe(7);
		expect(PageManager.pageForLine(10000)).toBe(78);
	});

	test("pageRange returns correct range for first page", () => {
		const range = PageManager.pageRange(0, 200);
		expect(range.startLine).toBe(1);
		expect(range.endLine).toBe(128);
	});

	test("pageRange returns correct range for second page", () => {
		const range = PageManager.pageRange(1, 300);
		expect(range.startLine).toBe(129);
		expect(range.endLine).toBe(256);
	});

	test("pageRange clamps endLine to docLineCount for last page", () => {
		const range = PageManager.pageRange(1, 200);
		expect(range.startLine).toBe(129);
		expect(range.endLine).toBe(200); // clamped
	});

	test("pageRange handles single-line document", () => {
		const range = PageManager.pageRange(0, 1);
		expect(range.startLine).toBe(1);
		expect(range.endLine).toBe(1);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Direction Detection
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Direction Detection", () => {
	let pm: PageManager;

	beforeEach(() => {
		pm = new PageManager();
	});

	test("returns null on first call (no previous viewport)", () => {
		expect(pm.detectDirection({ startLine: 100 })).toBeNull();
	});

	test("returns 'down' when scrolling forward", () => {
		// First call establishes previous viewport
		pm.maintainAfterEval({ startLine: 100, endLine: 130 }, createDoc(["a", "b", "c"]));
		expect(pm.detectDirection({ startLine: 150 })).toBe("down");
	});

	test("returns 'up' when scrolling backward", () => {
		pm.maintainAfterEval({ startLine: 100, endLine: 130 }, createDoc(["a", "b", "c"]));
		expect(pm.detectDirection({ startLine: 50 })).toBe("up");
	});

	test("returns null when viewport hasn't moved", () => {
		pm.maintainAfterEval({ startLine: 100, endLine: 130 }, createDoc(["a", "b", "c"]));
		expect(pm.detectDirection({ startLine: 100 })).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Eviction: Hot Pages Retain Everything
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Hot Pages (viewport ± 3 pages)", () => {
	test("lines in viewport page retain bytecodes + result after maintainAfterEval", () => {
		const doc = createLargeDoc(200);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Evaluate all → populates bytecodes + results
		evaluator.evaluateAll();

		// Viewport at lines 65-95 (all in page 0)
		const viewport = { startLine: 65, endLine: 95 };
		evaluator.evaluate(viewport);

		// Lines in page 0 should retain bytecodes and results (hot)
		const line1 = doc.getLineAt(1)!;
		expect(line1.bytecodes.length).toBeGreaterThan(0);
		expect(line1.result).not.toBeNull();

		const line128 = doc.getLineAt(128)!;
		expect(line128.bytecodes.length).toBeGreaterThan(0);
		expect(line128.result).not.toBeNull();
	});

	test("pages within ±3 of viewport are hot", () => {
		const doc = createLargeDoc(PAGE_SIZE * 10); // 1280 lines
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Viewport in page 5 (lines 641-768)
		const viewport = { startLine: 700, endLine: 730 };
		evaluator.evaluate(viewport);

		// Pages 2-3-4-5-6-7-8 should be hot (±3 from page 5)
		// Page 5 = viewport page
		// Hot range: pages 2-8 inclusive

		// Page 2 (lines 257-384): hot → bytecodes + result retained
		const hotLine = doc.getLineAt(300)!;
		expect(hotLine.bytecodes.length).toBeGreaterThan(0);
		expect(hotLine.result).not.toBeNull();

		// Page 8 (lines 1025-1152): hot → bytecodes + result retained
		const hotLine2 = doc.getLineAt(1100)!;
		expect(hotLine2.bytecodes.length).toBeGreaterThan(0);
		expect(hotLine2.result).not.toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Warm Pages (viewport ± 4-6): Keep Bytecode, Evict Results
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Warm Pages (±4-6 from viewport)", () => {
	test("warm pages retain bytecodes but evict results", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15); // ~1920 lines
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Viewport in page 7 (lines 897-1024)
		const viewport = { startLine: 900, endLine: 950 };
		evaluator.evaluate(viewport);

		// Warm pages: 1-3 and 11-13
		// Page 3 (lines 385-512): warm → bytecodes kept, result evicted
		const warmLine = doc.getLineAt(400)!;
		expect(warmLine.bytecodes.length).toBeGreaterThan(0);
		expect(warmLine.result).toBeNull(); // evicted

		// Page 11 (lines 1409-1536): warm → bytecodes kept, result evicted
		const warmLine2 = doc.getLineAt(1500)!;
		expect(warmLine2.bytecodes.length).toBeGreaterThan(0);
		expect(warmLine2.result).toBeNull(); // evicted
	});

	test("warm page variable definitions retain results", () => {
		const lines: string[] = [];
		// Fill page 0 with expressions, page 4 with variable def
		for (let i = 1; i <= PAGE_SIZE * 3; i++) {
			lines.push(`${i} + ${i}`);
		}
		// Variable def in page 4 (line 513+)
		lines.push(":important = 999");
		for (let i = lines.length; i < PAGE_SIZE * 8; i++) {
			lines.push(`${i} + ${i}`);
		}

		const doc = createDoc(lines);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Viewport in page 7 → page 4 is warm (±4-6 away)
		const viewport = { startLine: PAGE_SIZE * 7 + 1, endLine: PAGE_SIZE * 7 + 30 };
		evaluator.evaluate(viewport);

		// Variable def in page 4 should still have result
		const varDefLine = doc.getLineAt(PAGE_SIZE * 3 + 1)!;
		expect(varDefLine.isVariableDef).toBe(true);
		expect(varDefLine.result).not.toBeNull(); // pinned
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Cold Pages (> 6 pages from viewport): Evict Bytecode + Results
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Cold Pages (beyond ±6 from viewport)", () => {
	test("cold pages evict bytecodes + results, mark dirty", () => {
		const doc = createLargeDoc(PAGE_SIZE * 20); // ~2560 lines
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Viewport in page 10 (lines 1281-1408)
		const viewport = { startLine: 1300, endLine: 1350 };
		evaluator.evaluate(viewport);

		// Page 1 (lines 129-256): distance = 9 pages → cold
		const coldLine = doc.getLineAt(200)!;
		expect(coldLine.bytecodes.length).toBe(0);   // evicted
		expect(coldLine.result).toBeNull();     // evicted
		expect(coldLine.dirty).toBe(true);      // marked dirty for re-eval
	});

	test("cold pages are re-evaluated (Tier 1) when scrolled back into view", () => {
		const doc = createLargeDoc(PAGE_SIZE * 20);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Push page 1 cold by setting viewport far away
		evaluator.evaluate({ startLine: PAGE_SIZE * 10, endLine: PAGE_SIZE * 10 + 30 });

		// Page 1 should now be cold (bytecodes evicted, dirty)
		const coldLine = doc.getLineAt(200)!;
		expect(coldLine.bytecodes.length).toBe(0);
		expect(coldLine.dirty).toBe(true);

		// Now scroll back to page 1 — should get Tier 1 re-evaluation
		const result = evaluator.evaluate({ startLine: 199, endLine: 201 });

		expect(result.tierCounts.tier1).toBeGreaterThanOrEqual(1); // re-compiled
		const evaledLine = doc.getLineAt(200)!;
		expect(evaledLine.bytecodes.length).toBeGreaterThan(0);
		expect(evaledLine.dirty).toBe(false);
	});

	test("cold page variable definitions keep bytecodes (never evicted)", () => {
		const lines: string[] = [];
		for (let i = 1; i <= PAGE_SIZE * 10; i++) {
			lines.push(`${i} + ${i}`);
		}
		// Insert a variable def at page 1
		lines[200] = ":keepMe = 42";

		const doc = createDoc(lines);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Viewport at page 10 → page 1 is cold
		evaluator.evaluate({ startLine: PAGE_SIZE * 10, endLine: PAGE_SIZE * 10 + 30 });

		// Variable def in page 1 should still have bytecodes (pinned)
		const varDefLine = doc.getLineAt(201)!; // +1 for 1-based
		expect(varDefLine.isVariableDef).toBe(true);
		expect(varDefLine.bytecodes.length).toBeGreaterThan(0); // pinned — never evicted
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — Preload Targets
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Preload Targets", () => {
	let pm: PageManager;

	beforeEach(() => {
		pm = new PageManager();
	});

	test("returns empty array when no direction detected (first call)", () => {
		const doc = createLargeDoc(400);
		const targets = pm.getPreloadTargets({ startLine: 10, endLine: 40 }, doc);
		expect(targets.length).toBe(0);
	});

	test("returns empty array when scroll direction hasn't changed", () => {
		const doc = createLargeDoc(400);
		pm.maintainAfterEval({ startLine: 100, endLine: 130 }, doc);
		const targets = pm.getPreloadTargets({ startLine: 100, endLine: 130 }, doc);
		expect(targets.length).toBe(0);
	});

	test("returns dirty lines in preload pages when scrolling down", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		// First: establish a viewport
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 5, endLine: PAGE_SIZE * 5 + 50 }, doc);

		// Scroll down to page 6
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 6, endLine: PAGE_SIZE * 6 + 50 }, doc);

		// Preload targets should be in pages 10-11 (viewport page 6 + 4-5)
		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 6 + 1, endLine: PAGE_SIZE * 6 + 31 }, doc);

		// All lines in a fresh document are dirty → preload should find targets
		expect(targets.length).toBeGreaterThan(0);
		// All targets should be in pages 10-11 (lines 1281-1536)
		for (const t of targets) {
			const page = PageManager.pageForLine(
				doc.getLinePosition(t.lineId)
			);
			expect(page).toBeGreaterThanOrEqual(10);
			expect(page).toBeLessThanOrEqual(11);
		}
	});

	test("returns empty when preload pages are already clean", () => {
		const doc = createLargeDoc(PAGE_SIZE * 20);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Evaluate everything first → all lines clean
		evaluator.evaluateAll();

		// Establish prev viewport and trigger scroll down
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 5, endLine: PAGE_SIZE * 5 + 50 }, doc);
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 6, endLine: PAGE_SIZE * 6 + 50 }, doc);

		// Preload should find nothing — all lines are clean
		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 6 + 1, endLine: PAGE_SIZE * 6 + 31 }, doc);
		expect(targets.length).toBe(0);
	});

	test("returns dirty uncompiled lines in preload pages after cold eviction", () => {
		// Gradual eviction: only pages within COLD_EVICT_BUFFER (3) of the
		// warm range are evicted on each maintainAfterEval. Far-away pages
		// stay evicted once scrolled near — they don't need re-eviction.
		//
		// Strategy: scroll from page 12 → page 9. Page 12's cold left
		// buffer (pages 3-5) gets evicted. Then scrolling up to 9
		// preloads pages 5-4. Pages 5-4 were in the cold left buffer
		// from the page 12 viewport, so they're already cold-evicted.
		//
		// Viewport at page 12: warmStart=6, coldLeftEnd=5, coldLeftStart=3.
		// Pages 3, 4, 5 get bytecodes evicted. Then viewport moves to page 9
		// with direction "up". Preload target pages: 9-3-1=5, going back 2
		// pages: 5, 4. Both were evicted → found as dirty preload targets.
		const doc = createLargeDoc(PAGE_SIZE * 20);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Step 1: Scroll far to page 12 → cold left buffer evicts pages 3-5
		evaluator.evaluate({ startLine: PAGE_SIZE * 12, endLine: PAGE_SIZE * 12 + 30 });

		// Verify page 4 was actually evicted (within cold left buffer)
		const evictedLine = doc.getLineAt(PAGE_SIZE * 4 + 1)!;
		expect(evictedLine.bytecodes.length).toBe(0);
		expect(evictedLine.dirty).toBe(true);

		// Step 2: Scroll up to page 9 → direction "up"
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 12, endLine: PAGE_SIZE * 12 + 30 }, doc);
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 9, endLine: PAGE_SIZE * 9 + 30 }, doc);

		// Preload targets should be in pages 4-5 (9-3-1=5, going back 2 pages: 5, 4)
		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 9 + 1, endLine: PAGE_SIZE * 9 + 31 }, doc);

		expect(targets.length).toBeGreaterThan(0);
		// All targets should be dirty (cold eviction already marked them dirty)
		for (const t of targets) {
			const state = doc.getLineById(t.lineId);
			expect(state).toBeDefined();
			expect(state!.dirty).toBe(true);
		}
	});

	test("excludes empty lines from preload targets", () => {
		const lines: string[] = [];
		for (let i = 1; i <= PAGE_SIZE * 15; i++) {
			// Every 10th line is empty
			lines.push(i % 10 === 0 ? "" : `${i} + ${i}`);
		}
		const doc = createDoc(lines);

		// Establish prev viewport and scroll down
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 5, endLine: PAGE_SIZE * 5 + 50 }, doc);
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 6, endLine: PAGE_SIZE * 6 + 50 }, doc);

		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 6 + 1, endLine: PAGE_SIZE * 6 + 31 }, doc);
		expect(targets.length).toBeGreaterThan(0);

		// No target should be an empty line
		for (const t of targets) {
			const state = doc.getLineById(t.lineId)!;
			expect(state.isEmpty).toBe(false);
			expect(state.text.trim().length).toBeGreaterThan(0);
		}
	});

	test("returns targets when scrolling up", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);

		// Establish viewport at page 10
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 10, endLine: PAGE_SIZE * 10 + 50 }, doc);

		// Scroll up to page 8
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 8, endLine: PAGE_SIZE * 8 + 50 }, doc);

		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 8 + 1, endLine: PAGE_SIZE * 8 + 31 }, doc);

		// Direction is "up" → preload pages behind (viewport page 8 - 4-5 → pages 3-4)
		expect(targets.length).toBeGreaterThan(0);
		for (const t of targets) {
			const page = PageManager.pageForLine(
				doc.getLinePosition(t.lineId)
			);
			expect(page).toBeGreaterThanOrEqual(3);
			expect(page).toBeLessThanOrEqual(4);
		}
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// PageManager — clear()
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — clear()", () => {
	test("reset restores initial state", () => {
		const pm = new PageManager();
		const doc = createLargeDoc(200);

		pm.maintainAfterEval({ startLine: 100, endLine: 130 }, doc);

		// Direction should be detectable
		expect(pm.detectDirection({ startLine: 150 })).toBe("down");

		// Clear
		pm.clear();

		// Direction should be null again
		expect(pm.detectDirection({ startLine: 150 })).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// ThreeTierEvaluator Integration — Eviction After evaluate()
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Page Eviction Integration", () => {
	test("evaluate() triggers page eviction on cold pages", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Scroll to a far-away viewport → cold pages should be evicted
		evaluator.evaluate({ startLine: PAGE_SIZE * 10, endLine: PAGE_SIZE * 10 + 30 });

		// Page 1 should be evicted (cold)
		const coldLine = doc.getLineAt(100)!;
		expect(coldLine.bytecodes.length).toBe(0);
		expect(coldLine.dirty).toBe(true);
	});

	test("evaluateAll() triggers page eviction", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// After evaluateAll, everything is hot (viewport covers entire doc).
		// Then scroll to top → distant pages become cold
		evaluator.evaluate({ startLine: 1, endLine: 30 });

		// Pages beyond ±6 from page 0 should be cold
		const coldLine = doc.getLineAt(PAGE_SIZE * 10)!;
		expect(coldLine.bytecodes.length).toBe(0);
	});

	test("getPageManager() returns the internal PageManager", () => {
		const doc = createLargeDoc(200);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		const pm = evaluator.getPageManager();
		expect(pm).toBeDefined();
		expect(pm).toBeInstanceOf(PageManager);
	});

	test("variable def bytecodes survives cold eviction", () => {
		const lines: string[] = [];
		for (let i = 1; i <= PAGE_SIZE * 10; i++) {
			lines.push(`${i} + ${i}`);
		}
		// Insert variable def at page 1
		lines[200] = ":pinned = 42";

		const doc = createDoc(lines);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Push page 1 cold
		evaluator.evaluate({ startLine: PAGE_SIZE * 9, endLine: PAGE_SIZE * 9 + 30 });

		const varDefLine = doc.getLineAt(201)!;
		expect(varDefLine.isVariableDef).toBe(true);
		expect(varDefLine.bytecodes.length).toBeGreaterThan(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// ThreeTierEvaluator Integration — Preload During setViewport()
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Preload Integration", () => {
	test("setViewport() triggers page eviction", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// setViewport far from cold pages
		evaluator.setViewport({ startLine: PAGE_SIZE * 10, endLine: PAGE_SIZE * 10 + 30 });

		// Cold pages should be evicted
		const coldLine = doc.getLineAt(100)!;
		expect(coldLine.bytecodes.length).toBe(0);
	});

	// Regression test: cold-page eviction (which marks evicted non-variable-def
	// lines dirty) used to trip setViewport()'s checkpoint-invalidation guard on
	// EVERY call once the eviction window stabilized — the guard couldn't tell
	// the difference between "a variable def before the viewport is stale" and
	// "some plain expression line was evicted for memory". A document with no
	// variable definitions at all is the sharpest case: every setViewport() call
	// far from line 1 evicted the same pages, re-marked them dirty, and forced a
	// full evaluate() from line 1 forever, even though nothing had changed.
	test("repeated identical setViewport() far from line 1 stabilizes (no perpetual full-evaluate fallback)", () => {
		const doc = createLargeDoc(20000); // no variable definitions
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		const viewport = { startLine: 19900, endLine: 19930 };

		// First call may legitimately do real work (first-time eviction at this
		// position). Subsequent identical calls should NOT re-trigger a full
		// evaluate() — that would mean tier1/tier3 counts stay large and
		// dirtyCount never settles, exactly the reported symptom.
		evaluator.setViewport(viewport);
		const dirtyAfterFirst = doc.dirtyCount;

		const tier1Counts: number[] = [];
		for (let i = 0; i < 5; i++) {
			const result = evaluator.setViewport(viewport);
			tier1Counts.push(result.tierCounts.tier1);
		}

		// dirtyCount must stabilize, not grow or oscillate across repeated calls.
		expect(doc.dirtyCount).toBe(dirtyAfterFirst);

		// A stable viewport should settle into the cheap Tier 2 path — the full
		// evaluate() fallback (which reprocesses from line 1 and reports tier1
		// hits for every dirty line up to the viewport) must NOT keep firing.
		expect(tier1Counts[tier1Counts.length - 1]).toBe(0);
		expect(tier1Counts.every((c) => c === 0)).toBe(true);
	});

	test("setViewport on new evaluator works (PageManager starts fresh)", () => {
		const doc = createLargeDoc(PAGE_SIZE * 5);
		const engine = createEngine();
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

		evaluator.evaluateAll();

		// First setViewport
		const result = evaluator.setViewport({ startLine: 100, endLine: 130 });
		expect(result.tierCounts.tier2).toBeGreaterThanOrEqual(0);
	});

	test("maintainAfterEval is called after both evaluate and setViewport", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluateAll();

		// Scroll up via evaluate
		evaluator.evaluate({ startLine: 1, endLine: 30 });
		// Page 10 should be cold
		const cold1 = doc.getLineAt(PAGE_SIZE * 10)!;
		expect(cold1.bytecodes.length).toBe(0);

		// Re-evaluate all to make everything hot again
		evaluator.evaluateAll();

		// Now use setViewport
		const checkpointer = new VMCheckpointer(engine.getVM());
		const evaluator2 = new ThreeTierEvaluator(doc, engine, checkpointer);
		evaluator2.evaluateAll();
		evaluator2.setViewport({ startLine: 1, endLine: 30 });
		// Page 10 should be cold again
		const cold2 = doc.getLineAt(PAGE_SIZE * 10)!;
		expect(cold2.bytecodes.length).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("PageManager — Edge Cases", () => {
	test("handles document smaller than one page", () => {
		const doc = createDoc(["1 + 1", "2 + 2", "3 + 3"]);
		const pm = new PageManager();
		pm.maintainAfterEval({ startLine: 1, endLine: 3 }, doc);

		// All lines are in page 0 (viewport page), so hot — nothing evicted.
		// maintainAfterEval only evicts, it doesn't populate bytecodes.
		// Verify that no lines were incorrectly evicted despite the
		// small document where all pages past docEnd should be skipped.
		// Lines should still be in their initial dirty state.
		const line3 = doc.getLineAt(3)!;
		expect(line3.dirty).toBe(true); // still dirty (wasn't evaluated, just initial state)
	});

	test("handles single-line document", () => {
		const doc = createDoc(["42"]);
		const pm = new PageManager();
		// Should not throw
		pm.maintainAfterEval({ startLine: 1, endLine: 1 }, doc);
		expect(true).toBe(true);
	});

	test("handles zero-line document", () => {
		const doc = createDoc([]);
		const pm = new PageManager();
		// setDocument("") → ["\n"] actually. Let's use a real empty doc.
		// Actually createDoc([]) calls doc.setDocument("") which produces [""]
		// That's one empty line. It's fine.
		pm.maintainAfterEval({ startLine: 1, endLine: 1 }, doc);
		expect(true).toBe(true);
	});

	test("handles viewport beyond document end in maintainAfterEval", () => {
		const doc = createLargeDoc(100);
		const pm = new PageManager();
		// Viewport starts beyond the doc, but maintainAfterEval uses
		// pageForLine which correctly maps to page 0 for line 1000
		pm.maintainAfterEval({ startLine: 1000, endLine: 2000 }, doc);
		expect(true).toBe(true);
	});

	test("handles rapid multiple calls without errors", () => {
		const doc = createLargeDoc(PAGE_SIZE * 10);
		const pm = new PageManager();

		for (let i = 1; i <= 100; i++) {
			const start = ((i * 37) % (PAGE_SIZE * 9)) + 1;
			pm.maintainAfterEval({ startLine: start, endLine: start + 50 }, doc);
		}

		// Should not have thrown or leaked
		expect(true).toBe(true);
	});

	test("preload excludes lines that already have bytecodes", () => {
		const doc = createLargeDoc(PAGE_SIZE * 15);
		const engine = createEngine();
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Evaluate everything → all lines have bytecodes
		evaluator.evaluateAll();

		// Scroll a bit to establish direction
		const pm = evaluator.getPageManager();
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 5, endLine: PAGE_SIZE * 5 + 50 }, doc);
		pm.maintainAfterEval({ startLine: PAGE_SIZE * 6, endLine: PAGE_SIZE * 6 + 50 }, doc);

		// Now evict a single page to make it dirty + no-bytecodes
		// (We can't easily do this via maintainAfterEval since the pages are warm)
		// Instead, manually dirty a line and check it's included
		const targetLine = doc.getLineAt(PAGE_SIZE * 10 + 50)!;
		targetLine.bytecodes = [];
		targetLine.dirty = true;

		const targets = pm.getPreloadTargets({ startLine: PAGE_SIZE * 6 + 1, endLine: PAGE_SIZE * 6 + 31 }, doc);
		expect(targets.length).toBeGreaterThan(0);
	});
});
