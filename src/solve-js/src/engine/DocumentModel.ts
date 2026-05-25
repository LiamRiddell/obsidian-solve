import { Value } from "@solve-js/vm/Value";
import { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { djb2Hash } from "@solve-js/utilities/Hash";

// ── LineState ──────────────────────────────────────────────────────────────

/**
 * Persistent per-line state tracked by the DocumentModel.
 *
 * Each line receives an immutable `lineId` that survives structural edits
 * (insertions, deletions, line shifts). This allows caches, the dependency
 * graph, and VM checkpoints to reference lines by ID instead of by volatile
 * line numbers.
 */
export interface LineState {
	/** Immutable unique identifier — survives all structural edits. */
	readonly lineId: number;

	/** djb2 hash of the line text — used for O(1) change detection. */
	textHash: number;

	/** The full line text (may include markdown). */
	text: string;

	/**
	 * Extracted expression text, or null if this is a markdown-only line.
	 * For inline solves (s`...`), this is the expression between backticks.
	 */
	expression: string | null;

	/** Compiled bytecode, or null if not yet compiled / non-evaluable. */
	bytecode: BytecodeProgram | null;

	/** Variables this line reads (for dependency tracking). */
	reads: string[];

	/** Variables this line writes (empty if not a variable definition). */
	writes: string[];

	/** Last evaluation result, or null if not yet evaluated. */
	result: Value | null;

	/** True if this line needs re-evaluation. */
	dirty: boolean;

	/** True if this line defines a variable (never evict bytecode). */
	isVariableDef: boolean;

	/** True if this line contains only markdown (no evaluable expression). */
	isEmpty: boolean;
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
 * - Line ordering is maintained in a sorted `lineId[]` array with index-based lookup.
 * - A lazy position cache (`Map<lineId, number>`) provides O(1) position lookups
 *   after the first `getLinePosition()` call and is invalidated on structural edits.
 * - Array splices are O(N) but adequate for typical Obsidian documents (< 5000 lines).
 *   The structure can be upgraded to a Segment Tree / Order Statistic Tree for
 *   true O(log N) splices if needed for 100K+ line documents.
 *
 * Key invariant: line IDs never change, only their positions in the order array.
 * This means cached bytecode, dependency graph entries, and VM checkpoints
 * keyed by lineId remain valid across all structural edits.
 */
export class DocumentModel {
	/** Persistent line ID → LineState. */
	private lines: Map<number, LineState> = new Map();

	/** Ordered array of line IDs representing the current document structure. */
	private lineOrder: number[] = [];

	/** Monotonically increasing counter for new line IDs. */
	private nextLineId: number = 1;

	/**
	 * Lazy position cache: lineId → 1-based position.
	 * Built on first `getLinePosition()` call, invalidated on structural edits.
	 */
	private _positionCache: Map<number, number> | null = null;

	// ── Initialization ──────────────────────────────────────────────────

	/**
	 * Initialize or replace the entire document from a text blob.
	 * Clears all existing state and assigns new persistent line IDs.
	 */
	setDocument(text: string): void {
		this.lines.clear();
		this.lineOrder = [];
		this._positionCache = null;
		this.nextLineId = 1;

		const rawLines = text.split("\n");
		this.lineOrder = new Array(rawLines.length);

		for (let i = 0; i < rawLines.length; i++) {
			const lineId = this.nextLineId++;
			this.lineOrder[i] = lineId;
			this.lines.set(lineId, {
				lineId,
				textHash: djb2Hash(rawLines[i]),
				text: rawLines[i],
				expression: null,
				bytecode: null,
				reads: [],
				writes: [],
				result: null,
				dirty: true,
				isVariableDef: false,
				isEmpty: rawLines[i].trim().length === 0,
			});
		}
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

			// Collect old line IDs being removed
			const removedIds = this.lineOrder.slice(
				startIdx,
				startIdx + change.deleteCount
			);
			for (const id of removedIds) {
				removed.push(id);
			}

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
					expression: null,
					bytecode: null,
					reads: [],
					writes: [],
					result: null,
					dirty: true,
					isVariableDef: false,
					isEmpty: text.trim().length === 0,
				});
			}

			// Splice: remove old IDs, insert new IDs
			this.lineOrder.splice(startIdx, change.deleteCount, ...newIds);

			// Remove old LineState entries from the map
			for (const id of removedIds) {
				this.lines.delete(id);
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
		state.expression = null;
		state.bytecode = null;
		state.result = null;
		state.dirty = true;
		state.isEmpty = newText.trim().length === 0;
		return true;
	}

	// ── Queries ─────────────────────────────────────────────────────────

	/**
	 * Get the LineState at the given 1-based line position. O(1).
	 */
	getLineAt(position: number): LineState | undefined {
		const idx = position - 1;
		if (idx < 0 || idx >= this.lineOrder.length) return undefined;
		return this.lines.get(this.lineOrder[idx]);
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
		for (let i = 0; i < this.lineOrder.length; i++) {
			this._positionCache.set(this.lineOrder[i], i + 1);
		}

		return this._positionCache.get(lineId) ?? -1;
	}

	/**
	 * Get all LineState entries within the given viewport range (1-based, inclusive).
	 * The returned array is in document order.
	 */
	getVisibleLines(startLine: number, endLine: number): LineState[] {
		const startIdx = Math.max(0, startLine - 1);
		const endIdx = Math.min(this.lineOrder.length - 1, endLine - 1);

		if (startIdx > endIdx) return [];

		const result: LineState[] = [];
		for (let i = startIdx; i <= endIdx; i++) {
			const state = this.lines.get(this.lineOrder[i]);
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
		if (state) state.dirty = false;
	}

	/**
	 * Mark a line as dirty (needs re-evaluation) by its 1-based position.
	 * Convenience for callers that have line numbers instead of line IDs.
	 */
	markDirtyByLineNumber(lineNumber: number): void {
		const state = this.getLineAt(lineNumber);
		if (state) state.dirty = true;
	}

	/**
	 * Mark a line as dirty (needs re-evaluation).
	 */
	markDirty(lineId: number): void {
		const state = this.lines.get(lineId);
		if (state) state.dirty = true;
	}

	/**
	 * Mark all lines as dirty (e.g., after plugin register/unregister).
	 */
	invalidateAll(): void {
		for (const state of this.lines.values()) {
			state.dirty = true;
		}
	}

	/**
	 * Update a line's evaluation state after successful execution (Tier 1 / Tier 2).
	 *
	 * Sets result, bytecode, reads, writes, and marks the line clean.
	 */
	updateLineResult(
		lineId: number,
		result: Value,
		bytecode: BytecodeProgram,
		reads: string[],
		writes: string[],
		isVariableDef: boolean
	): void {
		const state = this.lines.get(lineId);
		if (!state) return;
		state.result = result;
		state.bytecode = bytecode;
		state.reads = reads;
		state.writes = writes;
		state.isVariableDef = isVariableDef;
		state.dirty = false;
	}

	/**
	 * Update a line's compile-only state (Tier 3: background compilation).
	 *
	 * Stores expression, bytecode, reads, and writes. Does NOT set a result
	 * and does NOT mark the line clean — it still needs execution (Tier 1 or
	 * Tier 2) to produce a result. This distinction allows the three-tier
	 * evaluation strategy: compile invisible lines in the background without
	 * executing them, then execute from cached bytecode when scrolled into view.
	 */
	updateLineCompiled(
		lineId: number,
		expression: string,
		bytecode: BytecodeProgram,
		reads: string[],
		writes: string[],
		isVariableDef: boolean
	): void {
		const state = this.lines.get(lineId);
		if (!state) return;
		state.expression = expression;
		state.bytecode = bytecode;
		state.reads = reads;
		state.writes = writes;
		state.isVariableDef = isVariableDef;
		// NOTE: dirty remains unchanged — line still needs execution
	}

	// ── Properties ──────────────────────────────────────────────────────

	get lineCount(): number {
		return this.lineOrder.length;
	}

	get isEmpty(): boolean {
		return this.lineOrder.length === 0;
	}

	/**
	 * Iterator over LineState in document order.
	 */
	*[Symbol.iterator](): IterableIterator<LineState> {
		for (const lineId of this.lineOrder) {
			const state = this.lines.get(lineId);
			if (state) yield state;
		}
	}

	// ── Lifecycle ───────────────────────────────────────────────────────

	clear(): void {
		this.lines.clear();
		this.lineOrder = [];
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
				hasBytecode: s.bytecode !== null,
				hasResult: s.result !== null,
				reads: s.reads,
				writes: s.writes,
			})),
		};
	}
}
