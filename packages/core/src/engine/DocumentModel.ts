import { Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { djb2Hash } from "@solve-js/utilities/Hash";
import { SegmentTree } from "@solve-js/engine/SegmentTree";

// ── LineState ──────────────────────────────────────────────────────────────

/**
 * Persistent per-line state tracked by the DocumentModel.
 *
 * Each line receives an immutable `lineId` that survives structural edits
 * (insertions, deletions, line shifts). This allows caches, the dependency
 * graph, and VM checkpoints to reference lines by ID instead of by volatile
 * line numbers.
 *
 * ── Multi-expression support ─────────────────────────────────────────
 * A single document line may contain multiple inline solves (`s\`...\``).
 * To support this without breaking the 1:1 line-to-DAG-node contract:
 * - `expressions[]` holds all extracted expression strings (1 entry for
 *   full-line expressions, N entries for N inline solves).
 * - `bytecodes[]` holds compiled bytecode in corresponding order.
 * - `results[]` holds evaluation **result groups** in corresponding order.
 *   Each element is a `Value[]` — a group of Values produced by that expression.
 *   For variable definitions, the group always has exactly 1 element.
 *   For multi-output expressions (e.g., currency conversion), the group
 *   may have multiple Values (one per target unit).
 * - `reads[]` and `writes[]` are aggregated across ALL expressions on
 *   the line — the DAG treats the line as a single dependency node.
 * - `inlineSolveCount` is 0 for full-line expressions, >0 for inline solves.
 */
export interface LineState {
	/** Immutable unique identifier — survives all structural edits. */
	readonly lineId: number;

	/** djb2 hash of the line text — used for O(1) change detection. */
	textHash: number;

	/** The full line text (may include markdown). */
	text: string;

	/**
	 * Extracted expression texts.
	 * - Full-line expressions: one entry (the trimmed text).
	 * - Inline solve lines: one entry per `s\`...\`` span, in left-to-right order.
	 * - Markdown-only lines: empty array.
	 */
	expressions: string[];

	/**
	 * Compiled bytecode for each expression, in corresponding order.
	 * Parallel to {@link expressions}.
	 */
	bytecodes: BytecodeProgram[];

	/** Variables this line reads (for dependency tracking). Aggregated across all expressions. */
	reads: string[];

	/** Variables this line writes (empty if not a variable definition). Aggregated across all expressions. */
	writes: string[];

	/**
	 * Evaluation result groups for each expression, in corresponding order.
	 * Each `Value[]` is a group of Values produced by one expression.
	 * Variable definitions always produce exactly 1 Value per group.
	 * Multi-output expressions (e.g. currency conversion) may produce N Values.
	 */
	results: Value[][];

	/**
	 * Convenience accessor for the first expression's first result.
	 * Equals `results[0]?.[0] ?? null`. For single-expression lines,
	 * this is the primary result. For multi-expression (inline solve) lines,
	 * prefer accessing `results[i][j]` directly.
	 */
	result: Value | null;

	/** True if this line needs re-evaluation. */
	dirty: boolean;

	/** True if any expression on this line defines a variable (never evict bytecode). */
	isVariableDef: boolean;

	/** True if this line contains only markdown (no evaluable expression). */
	isEmpty: boolean;

	/**
	 * Number of inline solve expressions on this line.
	 * 0 = full-line expression (or markdown-only).
	 * >0 = N inline solves embedded in markdown text.
	 */
	inlineSolveCount: number;
}

// ── ViewportRange ──────────────────────────────────────────────────────────

export interface ViewportRange {
	startLine: number; // 1-based, inclusive
	endLine: number; // 1-based, inclusive
}

// ── LineChange ─────────────────────────────────────────────────────────────

/** Describes a structural change to the document's line list. */
export interface LineChange {
	/** 1-based line number where the change starts. */
	startLine: number;
	/** Number of lines deleted (0 for pure insertion). */
	deleteCount: number;
	/** New line texts inserted in place of deleted lines. */
	insertLines: string[];
}

// ── ApplyChangesResult ─────────────────────────────────────────────────────

/** Result of applying changes to the document model. */
export interface ApplyChangesResult {
	/** Line IDs of newly inserted lines. */
	inserted: number[];
	/** Line IDs that were removed. */
	removed: number[];
}

// ── DocumentModel ──────────────────────────────────────────────────────────

/**
 * Persistent document model with O(log N) line lookups and structural edits.
 *
 * Design:
 * - Each line has an immutable `lineId` (monotonically increasing counter).
 * - `LineState` objects are stored in a `Map<lineId, LineState>` for O(1) access.
 * - Line ordering is maintained in a `SegmentTree` (order-statistic Treap) that
 *   supports O(log N) insert, delete, and get-at-index operations.
 * - A lazy position cache (`Map<lineId, number>`) provides O(1) position lookups
 *   after the first `getLinePosition()` call and is invalidated on structural edits.
 *
 * Key invariant: line IDs never change, only their positions in the order tree.
 * This means cached bytecode, dependency graph entries, and VM checkpoints
 * keyed by lineId remain valid across all structural edits.
 */
export class DocumentModel {
	/** Persistent line ID → LineState. */
	private lines: Map<number, LineState> = new Map();

	/** Order-statistic treap representing the current document line order. */
	private orderTree: SegmentTree = new SegmentTree();

	/** Monotonically increasing counter for new line IDs. */
	private nextLineId: number = 1;

	/**
	 * Lazy position cache: lineId → 1-based position.
	 * Built on first `getLinePosition()` call, invalidated on structural edits.
	 */
	private _positionCache: Map<number, number> | null = null;

	/**
	 * Line IDs currently marked dirty — maintained alongside every
	 * `state.dirty` mutation (in this class and in every other module that
	 * holds a direct `LineState` reference: ThreeTierEvaluator, PageManager).
	 * Lets {@link hasAnyDirtyLineBefore} answer "is anything before position
	 * X dirty" in O(d log N) — d = current dirty count, typically tiny once
	 * a document has settled after its initial evaluation — instead of
	 * O(N log N), which used to mean every scroll event re-walked the WHOLE
	 * document via `getLineAt()` regardless of how little of it was actually
	 * dirty. Benchmarked: ~10.6ms per setViewport() call scrolled near the
	 * bottom of a 20k-line document before this fix.
	 */
	private dirtyLineIds: Set<number> = new Set();

	// ── Initialization ──────────────────────────────────────────────────

	/**
	 * Initialize or replace the entire document from a text blob.
	 * Clears all existing state and assigns new persistent line IDs.
	 */
	setDocument(text: string): void {
		this.lines.clear();
		this.orderTree.clear();
		this._positionCache = null;
		this.dirtyLineIds.clear();
		this.nextLineId = 1;

		const rawLines = text.split("\n");
		const lineIds = new Array<number>(rawLines.length);

		for (let i = 0; i < rawLines.length; i++) {
			const lineId = this.nextLineId++;
			lineIds[i] = lineId;
			this.lines.set(lineId, {
				lineId,
				textHash: djb2Hash(rawLines[i]),
				text: rawLines[i],
				expressions: [],
				bytecodes: [],
				reads: [],
				writes: [],
				results: [],
				result: null,
				dirty: true,
				isVariableDef: false,
				isEmpty: rawLines[i].trim().length === 0,
				inlineSolveCount: 0,
			});
		}

		// O(N) balanced treap build from flat array
		this.orderTree.replaceAll(lineIds);

		// Every line starts dirty (see the object literal above) — seed the
		// tracking set to match. This is the one place the set is legitimately
		// O(N): a fresh document needs full evaluation anyway.
		for (const id of lineIds) this.dirtyLineIds.add(id);
	}

	// ── Structural edits ────────────────────────────────────────────────

	/**
	 * Apply one or more line-level changes to the document.
	 *
	 * **Precondition:** Changes must be **non-overlapping** in their line ranges.
	 * If two changes target the same or adjacent lines, the reverse-order
	 * processing may produce incorrect results because the first-applied
	 * change shifts the line numbers that the second change references.
	 *
	 * Changes are applied in **reverse order** (highest startLine first) so
	 * that earlier changes in the document don't shift the indices of later
	 * changes during processing.
	 *
	 * Returns both the newly inserted line IDs and the removed line IDs.
	 * Callers should use `removed` to clean up the dependency graph and
	 * other data structures keyed by lineId.
	 */
	applyChanges(changes: LineChange[]): ApplyChangesResult {
		const inserted: number[] = [];
		const removed: number[] = [];

		// Sort descending by startLine so earlier changes don't shift later indices
		const sorted = [...changes].sort((a, b) => b.startLine - a.startLine);

		for (const change of sorted) {
			const startIdx = change.startLine - 1; // convert to 0-based

			// Create new LineState entries for inserted lines
			const newIds: number[] = [];
			for (const text of change.insertLines) {
				const lineId = this.nextLineId++;
				newIds.push(lineId);
				inserted.push(lineId);
				this.lines.set(lineId, {
					lineId,
					textHash: djb2Hash(text),
					text,
					expressions: [],
					bytecodes: [],
					reads: [],
					writes: [],
					results: [],
					result: null,
					dirty: true,
					isVariableDef: false,
					isEmpty: text.trim().length === 0,
					inlineSolveCount: 0,
				});
			}

			// New lines start dirty (see the object literal above) — track them.
			for (const id of newIds) this.dirtyLineIds.add(id);

			// O(log N) splice: delete old IDs, insert new IDs
			const removedIds = this.orderTree.spliceAt(
				startIdx,
				change.deleteCount,
				newIds
			);
			for (const id of removedIds) {
				removed.push(id);
				this.lines.delete(id);
				this.dirtyLineIds.delete(id);
			}
		}

		// Invalidate position cache — positions shifted for all lines
		this._positionCache = null;

		return { inserted, removed };
	}

	/**
	 * Insert new lines at the given 1-based position.
	 * Convenience wrapper around applyChanges.
	 */
	insertLines(atLine: number, texts: string[]): number[] {
		const change: LineChange = {
			startLine: atLine,
			deleteCount: 0,
			insertLines: texts,
		};
		const result = this.applyChanges([change]);
		return result.inserted;
	}

	/**
	 * Delete lines in the given 1-based range [startLine, endLine] inclusive.
	 * Convenience wrapper around applyChanges.
	 */
	deleteLines(startLine: number, endLine: number): number[] {
		const change: LineChange = {
			startLine,
			deleteCount: endLine - startLine + 1,
			insertLines: [],
		};
		const result = this.applyChanges([change]);
		return result.removed;
	}

	/**
	 * Update the text of a single line in place.
	 * If the text hash differs, marks the line dirty and clears its
	 * bytecode/result so it gets re-evaluated.
	 *
	 * Returns true if the text actually changed (hash mismatch).
	 */
	editLine(lineNumber: number, newText: string): boolean {
		const state = this.getLineAt(lineNumber);
		if (!state) return false;

		const newHash = djb2Hash(newText);
		if (newHash === state.textHash) return false;

		state.text = newText;
		state.textHash = newHash;
		state.expressions = [];
		state.bytecodes = [];
		state.results = [];
		state.result = null;
		state.inlineSolveCount = 0;
		state.dirty = true;
		this.dirtyLineIds.add(state.lineId);
		state.isEmpty = newText.trim().length === 0;
		return true;
	}

	// ── Queries ─────────────────────────────────────────────────────────

	/**
	 * Get the LineState at the given 1-based line position. O(1).
	 */
	getLineAt(position: number): LineState | undefined {
		const idx = position - 1;
		const lineId = this.orderTree.getAt(idx);
		if (lineId === undefined) return undefined;
		return this.lines.get(lineId);
	}

	/**
	 * Get the 1-based position of a line by its persistent ID.
	 * Returns -1 if the line ID is not in the document.
	 *
	 * Uses a lazy position cache: O(N) on first call after structural edit,
	 * O(1) on subsequent calls. The cache is invalidated by any structural edit.
	 */
	getLinePosition(lineId: number): number {
		if (this._positionCache) {
			return this._positionCache.get(lineId) ?? -1;
		}

		// Build position cache on first call after invalidation
		this._positionCache = new Map();
		let pos = 1;
		for (const id of this.orderTree) {
			this._positionCache.set(id, pos++);
		}

		return this._positionCache.get(lineId) ?? -1;
	}

	/**
	 * Get all LineState entries within the given viewport range (1-based, inclusive).
	 * Uses SegmentTree.getRange() for O(viewport + log N) collection instead of
	 * O(viewport × log N) per-line lookups.
	 */
	getVisibleLines(startLine: number, endLine: number): LineState[] {
		const lineIds = this.orderTree.getRange(startLine - 1, endLine - 1);
		const result: LineState[] = [];
		for (const lineId of lineIds) {
			const state = this.lines.get(lineId);
			if (state) result.push(state);
		}
		return result;
	}

	/**
	 * Get all LineState entries in order. Useful for batch processing.
	 */
	getAllLines(): LineState[] {
		return this.getVisibleLines(1, this.lineCount);
	}

	/**
	 * Get a LineState by its persistent line ID. O(1).
	 */
	getLineById(lineId: number): LineState | undefined {
		return this.lines.get(lineId);
	}

	/**
	 * Get all lines that are marked dirty.
	 */
	getDirtyLines(): LineState[] {
		const result: LineState[] = [];
		for (const state of this.lines.values()) {
			if (state.dirty) result.push(state);
		}
		return result;
	}

	/**
	 * Whether any line before `position` (1-based, exclusive) is dirty.
	 *
	 * Used by ThreeTierEvaluator.setViewport() to decide whether cached
	 * checkpoint state might be stale and a full evaluate() (from line 1) is
	 * needed instead of the cheap viewport-only path.
	 *
	 * O(d log N) where d = current dirty line count via {@link dirtyLineIds},
	 * not O(N log N) — a document that's mostly clean (the steady state after
	 * initial load) answers this in the cost of resolving a handful of
	 * lineIds to positions, not walking every line up to `position`.
	 */
	hasAnyDirtyLineBefore(position: number): boolean {
		for (const lineId of this.dirtyLineIds) {
			const pos = this.getLinePosition(lineId);
			if (pos >= 1 && pos < position) return true;
		}
		return false;
	}

	/**
	 * Whether any **variable-definition** line before `position` (1-based,
	 * exclusive) is dirty.
	 *
	 * Narrower than {@link hasAnyDirtyLineBefore}: `VMCheckpointer.snapshot()`
	 * only ever records state for lines with `writes.length > 0` (see
	 * VMCheckpoints.ts), so a dirty plain-expression line before the viewport
	 * cannot have invalidated any checkpoint — there's no checkpoint entry
	 * for it to invalidate. Only a dirty variable-def line can mean the VM
	 * state a checkpoint would restore is stale.
	 *
	 * This distinction matters because `PageManager.evictPageBytecode()`
	 * marks evicted non-variable-def lines dirty (so they get Tier 1 if
	 * scrolled back into view), and Tier 3's compile-only path never clears
	 * `dirty` for non-variable-def lines by design. Using the broader
	 * `hasAnyDirtyLineBefore` here meant scrolling far into a large,
	 * variable-def-free document would trip `setViewport()`'s fallback to
	 * `evaluate()` on every single call — evaluate() reprocesses the evicted
	 * lines via Tier 3, which recompiles their bytecode without clearing
	 * dirty, so the very next `maintainAfterEval()` re-evicts and re-dirties
	 * the same lines, forever re-triggering the fallback on an otherwise
	 * unchanged viewport.
	 */
	hasAnyDirtyVariableDefLineBefore(position: number): boolean {
		for (const lineId of this.dirtyLineIds) {
			const state = this.lines.get(lineId);
			if (!state || !state.isVariableDef) continue;
			const pos = this.getLinePosition(lineId);
			if (pos >= 1 && pos < position) return true;
		}
		return false;
	}

	/** Number of lines currently marked dirty. For diagnostics/tests. */
	get dirtyCount(): number {
		return this.dirtyLineIds.size;
	}

	// ── Thread-safety validation ────────────────────────────────────────

	/**
	 * Verify that bytecode compiled by a worker is still valid for this line.
	 *
	 * When Phase 5.2h sends compilation to a worker, the worker posts back
	 * `{lineId, bytecode, reads, writes, compiledAgainstHash}`. Between dispatch
	 * and response, the user may have edited the line. This method lets the
	 * main thread check whether the bytecode is still applicable.
	 *
	 * @returns true if the line still exists and its text hash matches.
	 */
	isBytecodeValid(lineId: number, compiledAgainstHash: number): boolean {
		const state = this.lines.get(lineId);
		return state !== undefined && state.textHash === compiledAgainstHash;
	}

	// ── State mutations ─────────────────────────────────────────────────

	/**
	 * Mark a line as clean (re-evaluated successfully).
	 */
	markClean(lineId: number): void {
		const state = this.lines.get(lineId);
		if (state) {
			state.dirty = false;
			this.dirtyLineIds.delete(lineId);
		}
	}

	/**
	 * Mark a line as dirty (needs re-evaluation) by its 1-based position.
	 * Convenience for callers that have line numbers instead of line IDs.
	 */
	markDirtyByLineNumber(lineNumber: number): void {
		const state = this.getLineAt(lineNumber);
		if (state) {
			state.dirty = true;
			this.dirtyLineIds.add(state.lineId);
		}
	}

	/**
	 * Mark a line as dirty (needs re-evaluation).
	 */
	markDirty(lineId: number): void {
		const state = this.lines.get(lineId);
		if (state) {
			state.dirty = true;
			this.dirtyLineIds.add(lineId);
		}
	}

	/**
	 * Mark all lines as dirty (e.g., after plugin register/unregister).
	 */
	invalidateAll(): void {
		for (const state of this.lines.values()) {
			state.dirty = true;
		}
		this.dirtyLineIds = new Set(this.lines.keys());
	}

	/**
	 * Update a line's evaluation state after successful execution (Tier 1 / Tier 2).
	 *
	 * Sets results, bytecodes, reads, writes, and marks the line clean.
	 * Supports multi-expression lines (inline solves) via parallel arrays.
	 *
	 * @param lineId - Persistent line identifier.
	 * @param results - Evaluation result groups for each expression (in order). Each element is a Value[].
	 * @param bytecodes - Compiled bytecode for each expression (in order).
	 * @param expressions - Extracted expression strings (in order).
	 * @param reads - Aggregated read variables across all expressions.
	 * @param writes - Aggregated write variables across all expressions.
	 * @param isVariableDef - True if any expression defines a variable.
	 * @param inlineSolveCount - Number of inline solves (0 for full-line).
	 */
	updateLineResult(
		lineId: number,
		results: Value[][],
		bytecodes: BytecodeProgram[],
		expressions: string[],
		reads: string[],
		writes: string[],
		isVariableDef: boolean,
		inlineSolveCount: number = 0,
	): void {
		const state = this.lines.get(lineId);
		if (!state) return;
		state.results = results;
		state.result = results[0]?.[0] ?? null;
		state.bytecodes = bytecodes;
		state.expressions = expressions;
		state.reads = reads;
		state.writes = writes;
		state.isVariableDef = isVariableDef;
		state.inlineSolveCount = inlineSolveCount;
		state.dirty = false;
		this.dirtyLineIds.delete(lineId);
	}

	/**
	 * Update a line's compile-only state (Tier 3: background compilation).
	 *
	 * Stores expressions, bytecodes, reads, and writes. Does NOT set results
	 * and does NOT mark the line clean — it still needs execution (Tier 1 or
	 * Tier 2) to produce results. This distinction allows the three-tier
	 * evaluation strategy: compile invisible lines in the background without
	 * executing them, then execute from cached bytecode when scrolled into view.
	 *
	 * @param lineId - Persistent line identifier.
	 * @param expressions - Extracted expression strings (in order).
	 * @param bytecodes - Compiled bytecode for each expression (in order).
	 * @param reads - Aggregated read variables across all expressions.
	 * @param writes - Aggregated write variables across all expressions.
	 * @param isVariableDef - True if any expression defines a variable.
	 * @param inlineSolveCount - Number of inline solves (0 for full-line).
	 */
	updateLineCompiled(
		lineId: number,
		expressions: string[],
		bytecodes: BytecodeProgram[],
		reads: string[],
		writes: string[],
		isVariableDef: boolean,
		inlineSolveCount: number = 0,
	): void {
		const state = this.lines.get(lineId);
		if (!state) return;
		state.expressions = expressions;
		state.bytecodes = bytecodes;
		state.reads = reads;
		state.writes = writes;
		state.isVariableDef = isVariableDef;
		state.inlineSolveCount = inlineSolveCount;
		// NOTE: dirty remains unchanged — line still needs execution
	}

	// ── Properties ──────────────────────────────────────────────────────

	get lineCount(): number {
		return this.orderTree.length;
	}

	get isEmpty(): boolean {
		return this.orderTree.isEmpty;
	}

	/**
	 * Iterator over LineState in document order.
	 */
	*[Symbol.iterator](): IterableIterator<LineState> {
		for (const lineId of this.orderTree) {
			const state = this.lines.get(lineId);
			if (state) yield state;
		}
	}

	// ── Lifecycle ───────────────────────────────────────────────────────

	clear(): void {
		this.lines.clear();
		this.orderTree.clear();
		this._positionCache = null;
		this.nextLineId = 1;
	}

	/**
	 * Serialize the document model to a plain object for debugging.
	 */
	toJSON(): object {
		return {
			lineCount: this.lineCount,
			lines: this.getAllLines().map((s) => ({
				lineId: s.lineId,
				text: s.text.substring(0, 80), // truncate for readability
				textHash: s.textHash,
				dirty: s.dirty,
				isVariableDef: s.isVariableDef,
				isEmpty: s.isEmpty,
				hasBytecode: s.bytecodes.length > 0,
				hasResult: s.results.length > 0,
				inlineSolveCount: s.inlineSolveCount,
				reads: s.reads,
				writes: s.writes,
			})),
		};
	}
}
