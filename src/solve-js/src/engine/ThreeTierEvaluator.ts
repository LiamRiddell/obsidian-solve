import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import {
	DocumentModel,
	LineState,
	ViewportRange,
} from "@solve-js/engine/DocumentModel";
import { Value } from "@solve-js/vm/Value";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import { isEmptyLine, findInlineSolvesInLine } from "@solve-js/engine/ExpressionEngineSafety";

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
	/** The evaluation result, or null on error / non-evaluable. */
	result: Value | null;
	/** Error message, or null. */
	error: string | null;
}

// ── EvalResult ──────────────────────────────────────────────────────────

export interface EvalResult {
	/** Per-line evaluation results. */
	lines: EvalLineResult[];
	/** Map of line numbers → results for quick lookup. */
	resultMap: Map<number, Value>;
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
 * The evaluator runs synchronously on the main thread. Tier 3 compilation
 * is synchronous in this phase; Phase 5.2h will move it to a worker.
 * The `isBytecodeValid()` guard on DocumentModel allows worker-produced
 * bytecode to be safely applied by checking the text hash before use.
 */
export class ThreeTierEvaluator {
	private doc: DocumentModel;
	private engine: ExpressionEngine;
	private dag: DependencyGraph;
	private checkpointer: VMCheckpointer | null;

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
	evaluate(viewport: ViewportRange): EvalResult {
		const lines: EvalLineResult[] = [];
		const resultMap = new Map<number, Value>();
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

			if (lineResult.result && inViewport) {
				resultMap.set(pos, lineResult.result);
			}
		}

		return { lines, resultMap, tierCounts };
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
			// (text change clears bytecode via editLine).
			if (state.bytecode !== null && !state.isVariableDef) continue;

			const lineResult = this.evaluateSingleLine(state, pos, false);
			results.push(lineResult);
		}

		return results;
	}

	/**
	 * Evaluate all dirty lines in the document, regardless of viewport.
	 * Used for full re-evaluation after plugin register/unregister.
	 */
	evaluateAll(): EvalResult {
		return this.evaluate({ startLine: 1, endLine: this.doc.lineCount });
	}

	// ── Private helpers ─────────────────────────────────────────────────

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
			state.dirty = false;
			return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
		}

		// Determine the expression to evaluate (only needed for dirty lines)
		if (state.dirty) {
			const expression = this.extractExpression(state);

			if (inViewport) {
				// ── Tier 1: Visible + Dirty → Full Pipeline ──────────
				return this.evaluateTier1(state, lineNumber, expression, baseResult);
			} else {
				// ── Tier 3: Invisible + Dirty → Compile-only ─────────
				// Skip recompilation if already compiled by a previous Tier 3 pass.
				// Non-variable-def lines keep dirty=true after Tier 3 (so they get
				// Tier 1 when scrolled into view), but recompiling identical text
				// produces the same bytecode and DAG entries. Text changes clear
				// bytecode via DocumentModel.editLine(), so a null check is safe.
				if (state.bytecode !== null && !state.isVariableDef) {
					return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
				}
				return this.evaluateTier3(state, lineNumber, expression, baseResult);
			}
		}

		// Line is clean
		if (inViewport && state.bytecode && state.bytecode.opcodes.length > 0) {
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
	 */
	private evaluateTier1(
		state: LineState,
		lineNumber: number,
		expression: string,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		try {
			const value = this.engine.evaluateLine(lineNumber, expression);

			// The engine already updated DAG and LineCache internally.
			// Sync the DocumentModel from the LineCache.
			const entry = this.engine.getLineCache().getEntryForLine(lineNumber);
			if (entry) {
				this.doc.updateLineResult(
					state.lineId,
					value,
					entry.bytecode,
					entry.readVariables,
					entry.writeVariable ? [entry.writeVariable] : [],
					entry.writeVariable !== null
				);
		} else {
			// Fallback: LineCache missed — compile expression ourselves
			// and store bytecode so Tier 2 works on subsequent calls.
			// Wrap in its own try/catch so a compile failure doesn't discard
			// the already-computed value.
			try {
				const { program, reads, writes } = this.engine.compileExpression(expression);
				this.doc.updateLineResult(
					state.lineId,
					value,
					program,
					reads,
					writes,
					writes.length > 0
				);
				// engine.evaluateLine already registered reads/writes in DAG,
				// so this is idempotent (overwrites same line key).
				this.dag.registerLine(lineNumber, reads, writes);

				// ── Checkpoint after variable definition (fallback path) ──
				if (this.checkpointer && writes.length > 0) {
					this.checkpointer.snapshot(lineNumber, state.lineId, writes);
				}
			} catch (_compileErr) {
				// Fallback to basic sync: store result but no bytecode.
				// The line will go through Tier 1 again next time.
				state.result = value;
				state.dirty = false;
			}
		}

			// ── Checkpoint after variable definition (LineCache path) ──
		if (this.checkpointer && entry?.writeVariable) {
			this.checkpointer.snapshot(lineNumber, state.lineId, [entry.writeVariable]);
		}

		return { ...baseResult, tier: EvalTier.Tier1, result: value, error: null };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			// Keep dirty so it retries on next evaluation
			return { ...baseResult, tier: EvalTier.Tier1, result: null, error: errorMessage };
		}
	}

	/**
	 * Tier 2: Execute from cached bytecode only.
	 * Skips lexing, parsing, and compiling — runs the pre-compiled bytecode
	 * against the engine's shared VM. Assumes the VM already has correct
	 * variable state from preceding Tier-1 evaluations.
	 */
	private evaluateTier2(
		state: LineState,
		lineNumber: number,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		if (!state.bytecode || state.bytecode.opcodes.length === 0) {
			return { ...baseResult, tier: EvalTier.Skipped, result: null, error: null };
		}

		try {
			const value = this.engine.executeCached(state.bytecode);

			// Update DAG: re-register reads/writes from the cached metadata
			this.dag.registerLine(lineNumber, state.reads, state.writes);
			state.result = value;

			return { ...baseResult, tier: EvalTier.Tier2, result: value, error: null };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			// Mark dirty so it falls back to Tier 1 on next attempt
			state.dirty = true;
			return { ...baseResult, tier: EvalTier.Tier2, result: null, error: errorMessage };
		}
	}

	/**
	 * Tier 3: Compile-only for invisible lines.
	 * Lex → Parse → Compile to discover reads/writes for the dependency graph.
	 * Executes the bytecode ONLY if the line defines a variable (isVariableDef
	 * or writes.length > 0), because variable assignments affect VM state
	 * that other lines depend on. Pure expression lines are compiled but NOT
	 * executed — saving CPU for large documents.
	 */
	private evaluateTier3(
		state: LineState,
		lineNumber: number,
		expression: string,
		baseResult: Omit<EvalLineResult, "tier" | "result" | "error">
	): EvalLineResult {
		try {
			const { program, reads, writes } = this.engine.compileExpression(expression);

			const isVariableDef = writes.length > 0;
			let result: Value | null = null;

			// Store compile-only state in DocumentModel
			this.doc.updateLineCompiled(
				state.lineId,
				expression,
				program,
				reads,
				writes,
				isVariableDef
			);

			// Register reads/writes in DAG regardless
			this.dag.registerLine(lineNumber, reads, writes);

			if (isVariableDef && program.opcodes.length > 0) {
				// Variable definitions MUST execute to maintain VM state
				result = this.engine.executeCached(program);
				state.result = result;
				state.dirty = false;

				// ── Checkpoint after variable definition ────────────
				if (this.checkpointer) {
					this.checkpointer.snapshot(lineNumber, state.lineId, writes);
				}
				// Variable def lines are now clean (executed) but still
				// report as Tier 3 since they're invisible.
			}
			// NOTE: dirty stays true for non-variable-def lines so they
			// get Tier 1 execution when scrolled into view.

			return { ...baseResult, tier: EvalTier.Tier3, result, error: null };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			// Keep dirty so it retries
			return { ...baseResult, tier: EvalTier.Tier3, result: null, error: errorMessage };
		}
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
	 * Extract the evaluable expression from a LineState.
	 * Uses the stored expression if available, otherwise trims the raw text.
	 * Handles inline solve syntax: s`...` → extracts the expression.
	 */
	private extractExpression(state: LineState): string {
		// Use pre-extracted expression if available
		if (state.expression !== null) return state.expression;

		const text = state.text.trim();
		if (text.length === 0) return text;

		// Check for inline solve syntax: the full line is s`expression`
		const inlineSolves = findInlineSolvesInLine(state.text, 0);
		if (inlineSolves.length > 0) {
			// If the entire line is an inline solve, extract its expression
			if (/^s`[^`]*`$/.test(text)) {
				return inlineSolves[0].expression;
			}
			// Otherwise use the raw text — inline solves are handled by evaluateLine
		}

		return text;
	}
}
