import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import {
	DocumentModel,
	LineChange,
	LineState,
	ViewportRange,
} from "@solve-js/engine/DocumentModel";
import { Value, enableValueArena, disableValueArena, errorValue } from "@solve-js/vm/Value";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { isEmptyLine } from "@solve-js/engine/ExpressionEngineSafety";
import { sharedLexer } from "@solve-js/lexer/Lexer";
import { CompilationWorkerManager, type CompileRequestItem } from "@solve-js/engine/CompilationWorkerManager";
import { PageManager } from "@solve-js/engine/PageManager";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { EngineError } from "@solve-js/errors/UnifiedErrorFramework";
import { sharedGlobalVariableStore, globalDagKey } from "@solve-js/vm/GlobalVariableStore";

// ── EvalTier (diagnostic enum) ──────────────────────────────────────────

export enum EvalTier {
	/** Full pipeline: Lex → Parse → Compile → Execute (visible + dirty). */
	Tier1 = 1,
	/** Execute-only from cached bytecode (visible + cached). */
	Tier2 = 2,
	/** Compile-only for dependency tracking (invisible). Executes only variable assignments. */
	Tier3 = 3,
	/** Skipped — already clean or non-evaluable. */
	Skipped = 0,
}

// ── EvalLineResult ──────────────────────────────────────────────────────

export interface EvalLineResult {
	/** The line's persistent ID from DocumentModel. */
	lineId: number;
	/** 1-based line position. */
	lineNumber: number;
	/** Which tier was used. */
	tier: EvalTier;
	/** The first evaluation result, or null on error / non-evaluable. */
	result: Value | null;
	/** All result groups (one per expression/inline-solve), or undefined if skipped. */
	results?: Value[][];
	/** Error message, or null. */
	error: string | null;
}

// ── EvalResult ──────────────────────────────────────────────────────────

export interface EvalResult {
	/** Per-line evaluation results. */
	lines: EvalLineResult[];
	/** Map of line numbers → flattened results for quick lookup. */
	resultMap: Map<number, Value[]>;
	/** Number of lines processed at each tier. */
	tierCounts: { tier1: number; tier2: number; tier3: number; skipped: number };
}

// ── ThreeTierEvaluator ──────────────────────────────────────────────────

/**
 * Orchestrates three-tier evaluation over a persistent DocumentModel.
 *
 * ── Tier assignment ─────────────────────────────────────────────────
 * | Tier  | Condition                          | Action                        |
 * |───────|────────────────────────────────────|───────────────────────────────|
 * | **1** | Visible + Dirty (new/changed)      | Full pipeline: lex→parse→compile→execute |
 * | **2** | Visible + Cached (scroll into view)| Execute from cached bytecode  |
 * | **3** | Invisible + Dirty                  | Compile-only; execute only variable defs |
 * | Skip  | Clean, empty, or non-evaluable     | No action                     |
 *
 * ── Evaluation order ─────────────────────────────────────────────────
 * Lines are always processed in ascending document order (line 1 → end)
 * so that variable assignments flow correctly through the shared VM.
 * Tier 2 relies on this: by the time a clean cached line is reached,
 * the VM already contains all variables from preceding Tier-1 lines.
 *
 * ── Thread safety ────────────────────────────────────────────────────
 * Tier 1 (visible+dirty) compilation runs synchronously on the main thread
 * for immediate rendering. Tier 3 (invisible+dirty) compilation can be
 * dispatched to a Web Worker via `dispatchBackgroundCompiles()`. Worker-
 * compiled bytecode is stored in the DocumentModel and validated via
 * `isBytecodeValid()` to ensure the line text hasn't changed between
 * dispatch and response.
 */
export class ThreeTierEvaluator {
	private doc: DocumentModel;
	private engine: ExpressionEngine;
	private dag: DependencyGraph;
	private checkpointer: VMCheckpointer | null;
	private compilationWorker: CompilationWorkerManager | null = null;
	private pageManager: PageManager;

	/**
	 * Unsubscribe from sharedGlobalVariableStore — set in the constructor,
	 * called from terminateWorker(). See the subscription itself below for
	 * why this only marks lines dirty and never re-evaluates synchronously.
	 */
	private globalUnsubscribe: (() => void) | null = null;

	/**
	 * @param doc The persistent document model.
	 * @param engine The expression engine (shared VM is accessed via engine.getVM()).
	 * @param checkpointer Optional VM state checkpointer. If provided, the evaluator
	 * will create checkpoints after variable-definition lines and support fast VM
	 * restoration via `restoreTo()`. If omitted, checkpointing is disabled.
	 */
	constructor(
		doc: DocumentModel,
		engine: ExpressionEngine,
		checkpointer?: VMCheckpointer
	) {
		this.doc = doc;
		this.engine = engine;
		this.dag = engine.getDag();
		this.checkpointer = checkpointer ?? null;
		this.pageManager = new PageManager();

		// Lets the engine answer "what's line N's cached result" for
		// cross-line features (prev/line<N>/aggregation) without owning
		// document lifecycle itself — see ExpressionEngine.makeLineContext().
		this.engine.setDocumentModel(this.doc);

		// ── Cross-document global-variable propagation ──────────────────
		// GlobalVariableAsyncResolver (via preflight) handles a line's FIRST
		// resolution when a global it reads wasn't known yet. This handles
		// the ONGOING case: a line that already has a real (non-pending)
		// value for `global :x` needs to go dirty again when some OTHER
		// document writes a NEW value to x, so this document's next
		// evaluate() picks up the change — "dealing with the DAG across
		// pages", not just first-resolution.
		this.globalUnsubscribe = sharedGlobalVariableStore.subscribe((name) => {
			// Mark-dirty ONLY — never synchronously re-evaluate here.
			// enableValueArena/disableValueArena (Value.ts) is a single
			// non-reentrant module-level flag; evaluate()/setViewport() both
			// wrap their body in it, so a re-entrant evaluate() call from
			// inside this callback (itself possibly firing from INSIDE
			// another evaluate() call, via a STORE_GLOBAL_VAR opcode in some
			// other document being evaluated concurrently) would disable the
			// arena out from under the still-running outer call. This
			// mirrors applyTransaction()'s existing contract exactly: mark
			// dirty, let the caller's own evaluate() cadence pick it up.
			for (const lineNumber of this.dag.getAffectedLines(globalDagKey(name))) {
				this.doc.markDirtyByLineNumber(lineNumber);
			}
		});
	}

	/**
	 * Evaluate all lines needed to render the given viewport.
	 *
	 * Processes lines from 1 to `viewport.endLine` in document order.
	 * Dirty lines in the viewport get Tier-1 full pipeline; clean cached
	 * lines get Tier-2 bytecode execution. Lines after the viewport
	 * get Tier-3 compile-only (with variable-def execution).
	 *
	 * @returns Results for all processed lines, including tier metadata.
	 */
	evaluate(viewport: ViewportRange, signal?: AbortSignal): EvalResult {
		// ── One AbortController Per Keystroke ────────────────────────
		// Link the UI layer's keystroke signal to the engine so that
		// all per-evaluation AbortControllers created during this call
		// are canceled when the user types a new keystroke.
		this.engine.setKeystrokeSignal(signal ?? null);

		// ── Phase 5.3: Enable arena for zero-allocation Value reuse ──
		enableValueArena();
		try {
			const lines: EvalLineResult[] = [];
			const resultMap = new Map<number, Value[]>();
			const tierCounts = { tier1: 0, tier2: 0, tier3: 0, skipped: 0 };

			// Process from line 1 to the end of the viewport for correct VM state.
			// We go to viewport.endLine because Tier 3 for invisible lines can be
			// done separately via backgroundCompile().
			const docEnd = this.doc.lineCount;
			const evalEnd = Math.min(viewport.endLine, docEnd);

			for (let pos = 1; pos <= evalEnd; pos++) {
				const state = this.doc.getLineAt(pos);
				if (!state) {
					tierCounts.skipped++;
					continue;
				}

				const inViewport = pos >= viewport.startLine && pos <= viewport.endLine;

				const lineResult = this.evaluateSingleLine(state, pos, inViewport);
				lines.push(lineResult);

				if (lineResult.tier === EvalTier.Tier1) tierCounts.tier1++;
				else if (lineResult.tier === EvalTier.Tier2) tierCounts.tier2++;
				else if (lineResult.tier === EvalTier.Tier3) tierCounts.tier3++;
				else tierCounts.skipped++;

				if (lineResult.results && inViewport) {
					resultMap.set(pos, lineResult.results.flat());
				}
			}

			// ── Phase 5.2g: Page-based LRU eviction ──────────────────────
			// Evict bytecode/results from cold/warm pages to bound memory.
			this.pageManager.maintainAfterEval(viewport, this.doc);

			return { lines, resultMap, tierCounts };
		} finally {
			// Clear keystroke signal to prevent stale signal references
			// from being used by subsequent evaluations from other code paths.
			this.engine.setKeystrokeSignal(null);

			// Phase 5.3: Always disable arena — even on exception.
			// Prevents arena Values from leaking into subsequent evaluations or tests.
			disableValueArena();
		}
	}

	/**
	 * Background-compile invisible dirty lines beyond the viewport (Tier 3 only).
	 *
	 * Compiles expressions to discover reads/writes for the dependency graph
	 * without executing display-only expressions. Variable definitions are
	 * executed to maintain VM state for future Tier-2 executions.
	 *
	 * This is intended to be called after evaluate() so visible lines are
	 * rendered first, then background work fills in the dependency graph.
	 *
	 * **Phase 5.2h:** This synchronous method is retained for environments
	 * without Worker support. Prefer `dispatchBackgroundCompiles()` which
	 * offloads compilation to a Web Worker with Transferable bytecode.
	 */
	backgroundCompile(viewport: ViewportRange): EvalLineResult[] {
		const results: EvalLineResult[] = [];
		const docEnd = this.doc.lineCount;
		const startPos = viewport.endLine + 1;

		for (let pos = startPos; pos <= docEnd; pos++) {
			const state = this.doc.getLineAt(pos);
			if (!state) continue;

			// Skip clean lines — already compiled + executed
			if (!state.dirty) continue;

			// Skip already-compiled Tier 3 lines — they have bytecode
			// but were compiled without execution (non-variable-def).
			// Recompiling is wasteful since the text hasn't changed
			// (text change clears bytecodes via editLine).
			if (state.bytecodes.length > 0 && !state.isVariableDef) continue;

			const lineResult = this.evaluateSingleLine(state, pos, false);
			results.push(lineResult);
		}

		return results;
	}

	/**
	 * Dispatch background compilation to a Web Worker (Phase 5.2h).
	 *
	 * Collects invisible dirty lines beyond the viewport that need compilation,
	 * sends them to the compilation worker, and asynchronously stores the
	 * transferred bytecode in the DocumentModel when the worker responds.
	 *
	 * This is the non-blocking alternative to `backgroundCompile()`. The worker
	 * compiles expressions with Transferable ArrayBuffers (zero-copy postMessage),
	 * so bytecode appears on the main thread without serialization overhead.
	 *
	 * Lines that already have cached bytecode (from a previous worker pass or
	 * synchronous compile) are skipped — only truly uncompiled dirty lines are
	 * sent to the worker.
	 *
	 * **Usage:** Call after `evaluate()` so visible lines render first, then
	 * this fills the bytecode cache for future Tier-2 scrolls.
	 *
	 * @param viewport The current visible range. Lines beyond viewport.endLine
	 * that are dirty and don't have bytecode are dispatched.
	 */
	dispatchBackgroundCompiles(viewport: ViewportRange): void {
		// Collect invisible dirty lines that need compilation
		const items = this.collectInvisibleCompileTargets(viewport);
		if (items.length === 0) return;

		// Lazy-init the worker (only if there are items to compile)
		if (!this.compilationWorker) {
			this.compilationWorker = new CompilationWorkerManager();
		}

		// Fire-and-forget: send to worker, store results when they arrive
		this.compilationWorker.compileBatch(items).then((results) => {
			this.compilationWorker!.storeResults(results, this.doc);
		}).catch((_err) => {
			// Worker failure is non-fatal — next evaluate() will compile
			// these expressions synchronously.
		});
	}

	/**
	 * Terminate the compilation worker if active, and unsubscribe from
	 * sharedGlobalVariableStore. Call this when the evaluator is no longer
	 * needed to clean up resources — every call site that retires a
	 * ThreeTierEvaluator (document switch, pane destroy()) already calls
	 * this unconditionally, so folding the global-store unsubscribe in here
	 * needs no new call sites anywhere.
	 */
	terminateWorker(): void {
		if (this.compilationWorker) {
			this.compilationWorker.terminate();
			this.compilationWorker = null;
		}
		if (this.globalUnsubscribe) {
			this.globalUnsubscribe();
			this.globalUnsubscribe = null;
		}
	}

	/**
	 * Get the DocumentModel (read-only access for decoration building).
	 */
	getDoc(): DocumentModel {
		return this.doc;
	}

	/**
	 * Evaluate all dirty lines in the document, regardless of viewport.
	 * Used for full re-evaluation after plugin register/unregister.
	 */
	evaluateAll(signal?: AbortSignal): EvalResult {
		const viewport = { startLine: 1, endLine: this.doc.lineCount };
		const result = this.evaluate(viewport, signal);
		// evaluate() already calls maintainAfterEval internally
		return result;
	}

	/**
	 * Zero-allocation viewport evaluation — the Phase 5.2e "holy grail."
	 *
	 * **Key insight:** When the user scrolls (viewport-only change, no edits),
	 * we don't need to re-evaluate from line 1. Instead:
	 *
	 * 1. Restore the VM to just before the viewport via the nearest checkpoint.
	 * 2. Evaluate ONLY the visible lines (Tier 2 for clean cached, Tier 1 for dirty).
	 * 3. Lines before the viewport are completely skipped — their state lives in
	 *    the VM checkpointer's prototypal chain.
	 *
	 * **Correctness guard:** If any variable-definition line before the viewport
	 * is dirty (e.g., the user edited a variable def that hasn't been
	 * re-evaluated yet), we clear stale checkpoints and fall back to `evaluate()`
	 * which processes from line 1 and rebuilds fresh checkpoints. This
	 * guarantees that stale checkpoints are never used as restoration targets.
	 * Only variable-def lines matter here — `VMCheckpointer.snapshot()` only
	 * records state for lines that write a variable, so a dirty plain-expression
	 * line before the viewport has no checkpoint to invalidate (see
	 * `DocumentModel.hasAnyDirtyVariableDefLineBefore()`).
	 *
	 * **Performance:** O(visible lines) instead of O(document length). Target:
	 * < 1ms for a typical ~30-line viewport, independent of document size.
	 *
	 * @param viewport The visible line range.
	 * @returns Results for visible lines only. Lines before the viewport are
	 * not included in `lines[]` or `resultMap`.
	 */
	setViewport(viewport: ViewportRange, signal?: AbortSignal): EvalResult {
		// ── One AbortController Per Keystroke ────────────────────────
		// Link the UI layer's keystroke signal to the engine.
		this.engine.setKeystrokeSignal(signal ?? null);

		// ── Correctness guard: dirty lines before viewport invalidate checkpoints ──
		if (viewport.startLine > 1 && this.hasDirtyLinesBefore(viewport.startLine)) {
			// Clear stale checkpoints — evaluate() will rebuild them from line 1.
			// evaluate() handles its own arena enable/disable and signal cleanup.
			this.checkpointer?.clear();
			return this.evaluate(viewport, signal);
		}

		// ── Phase 5.2g: Page-based LRU eviction (MUST run before preload) ──
		// maintainAfterEval captures the scroll direction and updates lastViewportStart
		// BEFORE preloadNextPages reads the direction for preloading.
		this.pageManager.maintainAfterEval(viewport, this.doc);

		// ── Phase 5.2g: Detect scroll direction & preload ───────────
		this.preloadNextPages(viewport);

		// ── Restore VM state from nearest checkpoint before the viewport ──
		// This sets all variables that were defined at or before startLine-1.
		this.restoreTo(viewport.startLine - 1);

		// ── Phase 5.3: Enable arena for zero-allocation Tier 2 execution ──
		enableValueArena();
		try {
			// ── Evaluate only visible lines ──
			const result = this.collectEvalResults(viewport.startLine, viewport.endLine);
			return result;
		} finally {
			// Clear keystroke signal to prevent stale signal references.
			this.engine.setKeystrokeSignal(null);

			// Phase 5.3: Always disable arena — even on exception.
			// Prevents cross-test contamination from arena leaks.
			disableValueArena();
		}
	}

	/**
	 * Apply incremental line-level changes to the document model.
	 *
	 * **Phase 5.2f:** Replaces the O(N) `setDocument()` + full re-evaluation
	 * with O(changed) incremental updates. Key benefits:
	 *
	 * 1. Unchanged lines retain their persistent lineIds → bytecode survives
	 * 2. Only changed + DAG-downstream lines are marked dirty → Tier 1 re-evaluation
	 * 3. Clean lines in viewport use Tier 2 (cached bytecode execution)
	 * 4. Clean lines outside viewport are skipped entirely
	 *
	 * The DAG is fully cleared after propagation: shifted lines would have
	 * stale entries keyed by old line numbers, so the DAG is rebuilt from
	 * scratch during the subsequent `evaluate()` call.
	 *
	 * **Caller should follow up with `evaluate(viewport)`** to re-evaluate
	 * dirty lines from line 1 and rebuild the DAG + checkpoints.
	 *
	 * @param changes Line-level changes to apply. Must be non-overlapping.
	 * @returns Metadata about the applied changes.
	 */
	applyTransaction(changes: LineChange[]): {
		inserted: number[];
		removed: number[];
	} {
		// ── Phase 1: Collect DAG writes + downstream lineIds ───────────
		// Must happen BEFORE applyChanges() because line numbers are still
		// valid at this point. We collect writes from deleted lines and
		// resolve downstream consumers to lineIds (not line numbers) so
		// they survive the position shifts that applyChanges() causes.
		const allWrites = new Set<string>();

		for (const change of changes) {
			for (let i = 0; i < change.deleteCount; i++) {
				const lineNum = change.startLine + i;
				const writes = this.dag.getWrites(lineNum);
				for (const w of writes) {
					allWrites.add(w);
				}
				// Clean up DAG references for this line
				this.dag.removeLine(lineNum);
			}
		}

		// Resolve downstream consumers to persistent lineIds BEFORE the
		// structural change shifts line numbers. After applyChanges(),
		// we mark these lineIds dirty — their positions don't matter.
		const downstreamLineIds = new Set<number>();
		for (const writeVar of allWrites) {
			const affected = this.dag.getAffectedLines(writeVar);
			for (const lineNum of affected) {
				const state = this.doc.getLineAt(lineNum);
				if (state) {
					downstreamLineIds.add(state.lineId);
				}
			}
		}

		// ── Phase 2: Apply structural changes to DocumentModel ─────────
		const result = this.doc.applyChanges(changes);

		// ── Phase 3: Clear checkpointer (line numbers shifted) ─────────
		this.checkpointer?.clear();

		// ── Phase 4: Mark DAG-downstream lines dirty by lineId ─────────
		// Using lineId instead of line number is position-agnostic:
		// lines that shifted due to insertions/deletions above them are
		// still correctly targeted. Lines that were deleted (lineId no
		// longer in the doc) are silently ignored by markDirty().
		for (const lineId of downstreamLineIds) {
			this.doc.markDirty(lineId);
		}

		// ── Phase 5: Clear DAG to avoid phantom entries ────────────────
		// Entries keyed by old line numbers are stale after structural
		// changes. Rather than updating shifted entries, we clear the DAG
		// and let the subsequent evaluate() call rebuild it from scratch.
		this.dag.clear();

		return {
			inserted: result.inserted,
			removed: result.removed,
		};
	}

	// ── Private helpers ─────────────────────────────────────────────────

	/**
	 * Collect evaluation results for a contiguous range of lines.
	 *
	 * Used by both `evaluate()` (startLine=1) and `setViewport()` (any start).
	 * All lines in the range are treated as in-viewport (visible) — callers that
	 * need the invisible/dirty → Tier 3 handling should use `evaluate()` instead.
	 *
	 * @param startLine First line to evaluate (1-based, inclusive).
	 * @param endLine Last line to evaluate (1-based, inclusive). Clamped to docEnd.
	 */
	private collectEvalResults(startLine: number, endLine: number): EvalResult {
		const lines: EvalLineResult[] = [];
		const resultMap = new Map<number, Value[]>();
		const tierCounts = { tier1: 0, tier2: 0, tier3: 0, skipped: 0 };

		const docEnd = this.doc.lineCount;
		const evalEnd = Math.min(endLine, docEnd);

		for (let pos = startLine; pos <= evalEnd; pos++) {
			const state = this.doc.getLineAt(pos);
			if (!state) continue;

			// All processed lines are in-viewport for setViewport, or conditionally
			// in-viewport for evaluate (handled by caller). We pass `true` here
			// because evaluateSingleLine's `inViewport` param controls Tier 1 vs
			// Tier 3 dispatch; callers must manage this distinction externally.
			//
			// evaluate() handles this by passing `inViewport` per-line; it loops
			// directly rather than using this helper for that reason.
			const lineResult = this.evaluateSingleLine(state, pos, true);
			lines.push(lineResult);

			if (lineResult.tier === EvalTier.Tier1) tierCounts.tier1++;
			else if (lineResult.tier === EvalTier.Tier2) tierCounts.tier2++;
			else if (lineResult.tier === EvalTier.Tier3) tierCounts.tier3++;
			else tierCounts.skipped++;

			if (lineResult.results) {
				resultMap.set(pos, lineResult.results.flat());
			}
		}

		return { lines, resultMap, tierCounts };
	}

	/**
	 * Check whether any **variable-definition** line before `position`
	 * (1-based, exclusive) is dirty.
	 *
	 * Used by `setViewport()` to decide whether to fall back to `evaluate()`:
	 * if a variable-def before the viewport is dirty, the checkpoint state
	 * `restoreTo()` would use may be stale and we need to reprocess from
	 * line 1 to rebuild checkpoints correctly.
	 *
	 * Deliberately narrower than `DocumentModel.hasAnyDirtyLineBefore()`:
	 * checkpoints only snapshot variable-def lines (see VMCheckpointer), so a
	 * dirty plain-expression line before the viewport can't have invalidated
	 * one — there's nothing checkpointed for it to invalidate. Using the
	 * broader check here previously caused a real perf bug: `PageManager`'s
	 * cold-page eviction marks evicted non-variable-def lines dirty, so
	 * scrolling far into a large, variable-def-free document would trip this
	 * guard, fall back to `evaluate()`, which recompiles those lines via
	 * Tier 3 (never clearing their dirty flag by design), causing the very
	 * next `maintainAfterEval()` to re-evict and re-dirty them — a
	 * self-sustaining loop that pinned every subsequent `setViewport()` call
	 * to the cost of a full re-evaluation instead of O(visible lines).
	 *
	 * Delegates to DocumentModel.hasAnyDirtyVariableDefLineBefore(), which
	 * tracks dirty lineIds incrementally instead of scanning every line up to
	 * `position` on every call — this used to be a real per-scroll cost
	 * (benchmarked at ~10ms scrolled near the bottom of a 20k-line document)
	 * since it fired on every viewport change, not just edits.
	 */
	private hasDirtyLinesBefore(position: number): boolean {
		return this.doc.hasAnyDirtyVariableDefLineBefore(position);
	}

	/**
	 * Evaluate a single line using the appropriate tier.
	 *
	 * Tier assignment logic:
	 * - Empty/markdown-only lines → skipped
	 * - Dirty + in-viewport → Tier 1 (full pipeline)
	 * - Dirty + not in viewport → Tier 3 (compile-only, execute variable defs)
	 * - Clean + has bytecode + in viewport → Tier 2 (execute from cache)
	 * - Clean + no bytecode → skipped (non-evaluable)
	 */
	private evaluateSingleLine(
		state: LineState,
		lineNumber: number,
		inViewport: boolean
	): EvalLineResult {
		const baseResult: Omit<EvalLineResult, "tier" | "result" | "error"> = {
			lineId: state.lineId,
			lineNumber,
		};

		// Skip empty/markdown-only lines
		if (state.isEmpty || isEmptyLine(state.text)) {
			state.isEmpty = true;
			this.doc.markClean(state.lineId);
			return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
		}

		// Extract all evaluable expressions (may be multiple inline solves)
		const { expressions, inlineSolveCount } = this.extractExpressions(state);
		if (expressions.length === 0) {
			state.isEmpty = true;
			this.doc.markClean(state.lineId);
			return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
		}

		// Determine the expression to evaluate (only needed for dirty lines)
		if (state.dirty) {
			if (inViewport) {
				// ── Tier 1: Visible + Dirty → Full Pipeline ──────────
				return this.evaluateTier1(state, lineNumber, expressions, inlineSolveCount, baseResult);
			} else {
				// ── Tier 3: Invisible + Dirty → Compile-only ─────────
				// Skip recompilation if already compiled by a previous Tier 3 pass.
				// Non-variable-def lines keep dirty=true after Tier 3 (so they get
				// Tier 1 when scrolled into view), but recompiling identical text
				// produces the same bytecode and DAG entries. Text changes clear
				// bytecodes via DocumentModel.editLine(), so a length check is safe.
				if (state.bytecodes.length > 0 && state.bytecodes.length === expressions.length && !state.isVariableDef) {
					return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
				}
				return this.evaluateTier3(state, lineNumber, expressions, inlineSolveCount, baseResult);
			}
		}

		// Line is clean
		if (inViewport && state.bytecodes.length > 0) {
			// ── Tier 2: Visible + Cached → Execute from bytecode ────
			return this.evaluateTier2(state, lineNumber, baseResult);
		}

		// Clean, not in viewport, or no bytecode → skip
		return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
	}

	/**
	 * Tier 1: Full pipeline — lex, parse, compile, execute.
	 * Uses the engine's existing evaluateLine() which handles all pipeline
	 * stages including DAG updates and LineCache population.
	 *
	 * Supports multiple expressions per line (inline solves). Evaluates each
	 * expression left-to-right through the engine so variable definitions in
	 * earlier solves update the VM state before later solves are evaluated.
	 * Reads/writes are aggregated across all expressions for the DAG.
	 */
	private evaluateTier1(
		state: LineState,
		lineNumber: number,
		expressions: string[],
		inlineSolveCount: number,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		const allResults: Value[][] = [];
		const allBytecodes: BytecodeProgram[] = [];
		const allReads = new Set<string>();
		const allWrites = new Set<string>();
		let hasVariableDef = false;
		let lastValue: Value | null = null;
		let firstError: string | null = null;
		let anyFailed = false;

		// Evaluate each expression independently — a failure in one expression
		// (e.g., parse error in s`bad syntax`) must not prevent other expressions
		// on the same line from being evaluated and having their results stored.
		// Without per-expression error handling, same-line cross-reference inline
		// solves (s`:a = 5` s`:b = a + 3` s`a + b`) would lose ALL results when
		// the third expression throws because 'b' references cross a VM state
		// boundary or the engine encounters a transient error.
		for (const expression of expressions) {
			if (!expression.trim()) continue;

			let value: Value[] | null = null;
			let entry: { bytecode: BytecodeProgram; readVariables: string[]; writeVariable: string | null } | undefined;

			try {
				const evaluation = this.engine.evaluateLineDetailed(lineNumber, expression);
				value = evaluation.values;
				lastValue = value[0];
				// Sync the DocumentModel from the LineCache.
				// Use get(lineNumber, expression) instead of getEntryForLine(lineNumber)
				// because multiple expressions on the same line share the same lineNumber
				// and getEntryForLine always returns the FIRST entry (Map insertion order).
				entry = this.engine.getLineCache().get(lineNumber, expression) as typeof entry;
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				if (!firstError) firstError = errorMessage;
				anyFailed = true;
				value = null;
			}

			if (value) {
				allResults.push(value);
			} else {
				// Expression failed — push an ErrorValue sentinel so results[] stays
				// aligned with expressions[] and bytecodes[] indices. Downstream code
				// checking result.type === Error will find it, vs a raw null that NPEs.
				allResults.push([errorValue("eval_failed", firstError ?? "unknown error")]);
			}

			if (entry) {
				allBytecodes.push(entry.bytecode);
				for (const r of entry.readVariables) allReads.add(r);
				if (entry.writeVariable) {
					allWrites.add(entry.writeVariable);
					hasVariableDef = true;
				}
			} else {
				// Fallback: LineCache missed — compile expression ourselves
				try {
					const { program, reads, writes } = this.engine.compileExpression(expression);
					allBytecodes.push(program);
					for (const r of reads) allReads.add(r);
					for (const w of writes) allWrites.add(w);
					if (writes.length > 0) hasVariableDef = true;
				} catch (compileErr) {
					// Push empty bytecode — expression will recompile on next pass.
					// The expression still failed to compile, but reads/writes were
					// already extracted from its tokens before the parse attempt —
					// compileExpression() surfaces them via the thrown error's
					// context. Register them anyway so the DAG knows this line
					// depends on those variables and re-evaluates it once they
					// become defined, instead of losing the dependency entirely.
					allBytecodes.push({ opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false });
					if (compileErr instanceof EngineError && compileErr.context) {
						const errReads = compileErr.context.reads;
						const errWrites = compileErr.context.writes;
						if (Array.isArray(errReads)) for (const r of errReads) allReads.add(r);
						if (Array.isArray(errWrites)) for (const w of errWrites) allWrites.add(w);
					}
				}
			}
		}

		const reads = [...allReads];
		const writes = [...allWrites];

		// Always store results — even partial ones. If any expression failed,
		// the line stays dirty so the failed expression(s) get retried on the
		// next evaluation pass. But successfully-evaluated expressions' results
		// are preserved so the DAG, UI decorations, and downstream consumers
		// can use them immediately.
		if (anyFailed) {
			// Store partial results via updateLineCompiled (doesn't clear dirty).
			// The successful expressions' bytecodes are cached so Tier 2 works
			// for them on the next scroll pass.
			this.doc.updateLineCompiled(
				state.lineId,
				expressions,
				allBytecodes,
				reads,
				writes,
				hasVariableDef,
				inlineSolveCount,
			);
			// Also set results for the successful expressions
			state.results = allResults;
			state.result = allResults[0]?.[0] ?? null;
			state.inlineSolveCount = inlineSolveCount;
			state.expressions = expressions;
		} else {
			// All expressions succeeded — store full results and mark clean
			this.doc.updateLineResult(
				state.lineId,
				allResults,
				allBytecodes,
				expressions,
				reads,
				writes,
				hasVariableDef,
				inlineSolveCount,
			);
		}

		// Register reads/writes in DAG (aggregated across all expressions).
		// Always register — even lines with no reads/writes (pure expressions
		// like "2+2") need DAG entries so downstream queries for line presence work.
		this.dag.registerLine(lineNumber, reads, writes);

		// ── Checkpoint after variable definition ──
		if (this.checkpointer && writes.length > 0 && !anyFailed) {
			this.checkpointer.snapshot(lineNumber, state.lineId, writes);
		}

		return {
			...baseResult,
			tier: EvalTier.Tier1,
			result: lastValue,
			results: allResults,
			error: firstError,
		};
	}

	/**
	 * Tier 2: Execute from cached bytecode only.
	 * Skips lexing, parsing, and compiling — runs the pre-compiled bytecode
	 * against the engine's shared VM. Supports multiple bytecodes per line
	 * (inline solves) — each is executed left-to-right so variable definitions
	 * in earlier bytecodes update the VM before later ones run.
	 * Assumes the VM already has correct variable state from preceding
	 * Tier-1 evaluations.
	 */
	private evaluateTier2(
		state: LineState,
		lineNumber: number,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		if (state.bytecodes.length === 0) {
			return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
		}

		const results: Value[][] = [];
		let lastValue: Value | null = null;
		let firstError: string | null = null;
		let anyFailed = false;

		// Execute each bytecode independently — a failure in one should not
		// prevent other bytecodes on the same line from executing. Same-line
		// inline solves with variable definitions (s`:a = 5` s`a + 3`) rely
		// on earlier bytecodes updating the VM before later ones execute.
		for (const bytecode of state.bytecodes) {
			if (bytecode.opcodes.length === 0) continue;
			try {
				const value = this.engine.executeCached(bytecode, lineNumber);
				lastValue = value;
				results.push([value]);
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				if (!firstError) firstError = errorMessage;
				anyFailed = true;
				// Push error sentinel to maintain results[i] ↔ bytecodes[i] alignment
				results.push([errorValue("exec_failed", errorMessage)]);
			}
		}

		// Update DAG: re-register reads/writes from the cached metadata.
		// Always register — even empty reads/writes so DAG line-presence queries work.
		this.dag.registerLine(lineNumber, state.reads, state.writes);

		state.results = results;
		state.result = results[0]?.[0] ?? null;
		if (anyFailed) {
			// Mark dirty so failed bytecodes are re-compiled (Tier 1) next pass
			this.doc.markDirty(state.lineId);
		}

		return { ...baseResult, tier: EvalTier.Tier2, result: lastValue, results, error: firstError };
	}

	/**
	 * Tier 3: Compile-only for invisible lines.
	 * Lex → Parse → Compile to discover reads/writes for the dependency graph.
	 * Executes the bytecode ONLY if the line defines a variable (isVariableDef
	 * or writes.length > 0), because variable assignments affect VM state
	 * that other lines depend on. Pure expression lines are compiled but NOT
	 * executed — saving CPU for large documents.
	 *
	 * Supports multiple expressions per line (inline solves). Each is compiled
	 * separately; variable-def expressions are also executed.
	 */
	private evaluateTier3(
		state: LineState,
		lineNumber: number,
		expressions: string[],
		inlineSolveCount: number,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		const allBytecodes: BytecodeProgram[] = [];
		const allReads = new Set<string>();
		const allWrites = new Set<string>();
		let hasVariableDef = false;
		let lastResult: Value | null = null;
		let firstError: string | null = null;
		let anyFailed = false;

		// Compile each expression independently — a parse error in one
		// should not prevent other expressions from being compiled and
		// having their reads/writes registered in the DAG.
		for (const expression of expressions) {
			if (!expression.trim()) continue;

			try {
				const { program, reads, writes } = this.engine.compileExpression(expression);
				allBytecodes.push(program);
				for (const r of reads) allReads.add(r);
				for (const w of writes) allWrites.add(w);
				if (writes.length > 0) hasVariableDef = true;

				if (writes.length > 0 && program.opcodes.length > 0) {
					// Variable definitions MUST execute to maintain VM state
					lastResult = this.engine.executeCached(program, lineNumber);
				}
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				if (!firstError) firstError = errorMessage;
				anyFailed = true;
				// Push empty bytecode placeholder for alignment
				allBytecodes.push({ opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false });
			}
		}

		const reads = [...allReads];
		const writes = [...allWrites];

		// Store compile-only state in DocumentModel — even partial results
		// preserve successful expressions' bytecodes and DAG data.
		this.doc.updateLineCompiled(
			state.lineId,
			expressions,
			allBytecodes,
			reads,
			writes,
			hasVariableDef,
			inlineSolveCount,
		);

		// Register reads/writes in DAG regardless — partial data is valid.
		// Always register — even empty reads/writes for DAG line-presence queries.
		this.dag.registerLine(lineNumber, reads, writes);

		if (hasVariableDef && lastResult && !anyFailed) {
			state.results = [[lastResult]];
			state.result = lastResult;
			this.doc.markClean(state.lineId);

			// ── Checkpoint after variable definition ────────────
			if (this.checkpointer) {
				this.checkpointer.snapshot(lineNumber, state.lineId, writes);
			}
		}

		return { ...baseResult, tier: EvalTier.Tier3, result: lastResult, results: hasVariableDef && lastResult && !anyFailed ? [[lastResult]] : undefined, error: firstError };
	}

	// ── Public checkpoint API (used by Phase 5.2e setViewport) ──────

	/**
	 * Restore the VM to the state at or just after the given line number.
	 *
	 * Finds the nearest checkpoint at or before `lineNumber` and replays
	 * all variable definitions from the checkpoint chain into the VM.
	 * After calling this, the VM is ready to evaluate lines starting at
	 * `lineNumber + 1` without re-evaluating all preceding lines.
	 *
	 * **Usage:** Phase 5.2e's `setViewport()` calls `restoreTo(viewport.startLine - 1)`
	 * before evaluating only the newly visible lines. This is the key to
	 * O(visible lines) scrolling.
	 *
	 * @param lineNumber The line number to restore to. Variables defined
	 * at lines ≤ this number will be available in the VM.
	 */
	restoreTo(lineNumber: number): void {
		if (this.checkpointer) {
			this.checkpointer.restoreTo(lineNumber);
		}
	}

	/**
	 * Get the VM checkpointer, or null if checkpointing is disabled.
	 */
	getCheckpointer(): VMCheckpointer | null {
		return this.checkpointer;
	}

	/**
	 * Get the PageManager (Phase 5.2g).
	 * Exposed for testing.
	 */
	getPageManager(): PageManager {
		return this.pageManager;
	}

	// ── Phase 5.2g: Directional preloading ──────────────────────────

	/**
	 * Preload the next 1–2 pages in the current scroll direction.
	 *
	 * Called during `setViewport()` (scroll-only path). Collects dirty
	 * uncompiled lines in pages just beyond the viewport and dispatches
	 * them to the background compilation worker so bytecode is ready
	 * before the user scrolls those lines into view.
	 */
	private preloadNextPages(viewport: ViewportRange): void {
		const targets = this.pageManager.getPreloadTargets(viewport, this.doc);
		if (targets.length === 0) return;

		// Lazy-init worker if needed
		if (!this.compilationWorker) {
			this.compilationWorker = new CompilationWorkerManager();
		}

		// Fire-and-forget: worker compiles, stores bytecode on response
		this.compilationWorker.compileBatch(targets).then((results) => {
			this.compilationWorker!.storeResults(results, this.doc);
		}).catch((_err) => {
			// Non-fatal — next evaluate() will compile synchronously
		});
	}

	/**
	 * Collect invisible dirty lines that need background compilation.
	 *
	 * Iterates lines beyond `viewport.endLine`, filtering for:
	 * - Dirty lines (need re-compilation)
	 * - Non-empty, non-markdown lines
	 * - No existing bytecode (skip already-compiled Tier 3 lines)
	 *
	 * Returns CompileRequestItem[] suitable for CompilationWorkerManager.
	 */
	private collectInvisibleCompileTargets(viewport: ViewportRange): CompileRequestItem[] {
		const items: CompileRequestItem[] = [];
		const docEnd = this.doc.lineCount;
		const startPos = viewport.endLine + 1;

		for (let pos = startPos; pos <= docEnd; pos++) {
			const state = this.doc.getLineAt(pos);
			if (!state) continue;

			// Skip clean lines
			if (!state.dirty) continue;

			// Skip already-compiled lines
			if (state.bytecodes.length > 0 && !state.isVariableDef) continue;

			// Skip empty/markdown-only lines
			if (state.isEmpty || isEmptyLine(state.text)) continue;

			const { expressions } = this.extractExpressions(state);
			if (expressions.length === 0) continue;

			// Create one CompileRequestItem per expression (inline solves
			// on the same line share the same lineId + textHash). The worker
			// compiles each independently; storeResults batches by lineId.
			for (const expression of expressions) {
				if (!expression.trim()) continue;
				items.push({
					lineId: state.lineId,
					expression,
					textHash: state.textHash,
				});
			}
		}

		return items;
	}

	/**
	 * Extract all evaluable expressions from a LineState.
	 *
	 * For full-line expressions: returns `{ expressions: [trimmedText], inlineSolveCount: 0 }`.
	 * For inline solve lines: returns `{ expressions: [...allSolves], inlineSolveCount: N }`.
	 * For pre-extracted (cached) expressions: returns the cached array.
	 *
	 * Inline solves are extracted left-to-right via the sharedLexer, so variable
	 * definitions in earlier solves (e.g., `s\`x = 5\` more text s\`x + 1\``)
	 * correctly update the VM state before later solves are evaluated.
	 */
	private extractExpressions(state: LineState): { expressions: string[]; inlineSolveCount: number } {
		// Use pre-extracted expressions if available (from cache / previous evaluation)
		if (state.expressions.length > 0) {
			return { expressions: state.expressions, inlineSolveCount: state.inlineSolveCount };
		}

		const trimmed = state.text.trim();
		if (trimmed.length === 0) return { expressions: [], inlineSolveCount: 0 };

		// Check for inline solve syntax: s`expression`
		const inlineSpans = sharedLexer.findInlineSolves(state.text);
		if (inlineSpans.length > 0) {
			return {
				expressions: inlineSpans.map(s => s.expression),
				inlineSolveCount: inlineSpans.length,
			};
		}

		// Full-line expression
		return { expressions: [trimmed], inlineSolveCount: 0 };
	}
}
