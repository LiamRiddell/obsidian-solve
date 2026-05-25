import { Value } from "@solve-js/vm/Value";
import type { VM } from "@solve-js/vm/OpRegistry";

// ── VMCheckpoint ────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of VM variable state.
 *
 * Uses **prototypal inheritance** for memory efficiency: each checkpoint's
 * `variables` object has its parent checkpoint's `variables` as its
 * `__proto__`. This means a `getVar("x")` lookup walks the prototype chain
 * until it finds `x`, and only variables that CHANGED at this checkpoint
 * consume heap space. Unchanged variables are inherited from the parent.
 *
 * ```text
 * Checkpoint 0 (root):  {}                        // empty scope
 * Checkpoint 1 (:x=5):  { x: 5 }    __proto__ → 0
 * Checkpoint 2 (:y=8):  { y: 8 }    __proto__ → 1
 * Checkpoint 3 (:x=3):  { x: 3 }    __proto__ → 2   // shadows x=5
 * ```
 *
 * To look up `x` at checkpoint 3: find own `x=3` → done.
 * To look up `y` at checkpoint 3: not own → walk proto to checkpoint 2 → `y=8`.
 * To look up `z` at checkpoint 3: not found anywhere → undefined.
 *
 * **Memory:** O(number of variable definitions) heap, independent of
 * document length. Typical Obsidian documents have < 100 variable defs,
 * so total checkpoint heap is < 10 KB.
 */
export interface VMCheckpoint {
	/** 1-based line number where this checkpoint was created. */
	lineNumber: number;
	/** Persistent line ID from DocumentModel. */
	lineId: number;
	/**
	 * Variable name → Value at this checkpoint.
	 * Own properties are variables set/updated at this line.
	 * The prototype chain provides inherited variables from parent checkpoints.
	 */
	variables: Record<string, Value>;
	/** Parent checkpoint (closer to document start), or null for root. */
	parent: VMCheckpoint | null;
}

// ── VMCheckpointer ──────────────────────────────────────────────────────

/**
 * Manages VM state checkpoints for the three-tier evaluation strategy.
 *
 * **Checkpoint creation:** After a variable-definition line executes
 * (Tier 1 or Tier 3), `snapshot()` records the current values of the
 * written variables. The checkpoint is linked via prototypal inheritance
 * to the previous checkpoint, so only changed variables consume memory.
 *
 * **Checkpoint restoration:** Before evaluating a viewport whose start line
 * is not line 1, `restoreTo(lineNumber)` resets the VM and replays all
 * variable definitions up to and including that line. This avoids
 * re-evaluating the entire document from line 1 on every scroll.
 *
 * **Thread safety:** Checkpoints are created synchronously on the main
 * thread during evaluation. They are immutable after creation (Value is
 * an immutable type), so no synchronization is needed.
 *
 * **Integration with Phase 5.2e:** `setViewport()` will use `getNearestCheckpoint()`
 * to find the checkpoint just before the new viewport start, then call
 * `restoreTo()` to set up the VM before evaluating only the visible lines.
 * This is the key to O(visible lines) scrolling instead of O(document).
 */
export class VMCheckpointer {
	/** Ordered array of checkpoints (ascending lineNumber). */
	private checkpoints: VMCheckpoint[] = [];
	/** The VM instance whose variables are snapshotted/restored. */
	private vm: VM;

	constructor(vm: VM) {
		this.vm = vm;
	}

	// ── Snapshot ─────────────────────────────────────────────────────

	/**
	 * Create a checkpoint at the current line, recording the VM values of
	 * the specified variables.
	 *
	 * Uses prototypal inheritance: `Object.create(parent.variables)` so
	 * that inherited variable lookups fall through to previous checkpoints
	 * without copying all variables into each checkpoint.
	 *
	 * @param lineNumber 1-based line position.
	 * @param lineId Persistent line ID from DocumentModel.
	 * @param variableNames Names of variables that were written at this line.
	 * @returns The new checkpoint, or null if no variable names provided.
	 */
	snapshot(
		lineNumber: number,
		lineId: number,
		variableNames: string[]
	): VMCheckpoint | null {
		if (variableNames.length === 0) return null;

		const parent =
			this.checkpoints.length > 0
				? this.checkpoints[this.checkpoints.length - 1]
				: null;

		// Create prototypal chain: new checkpoint inherits from parent
		const variables: Record<string, Value> = Object.create(
			parent?.variables ?? null
		) as Record<string, Value>;

		// Record current VM values for the written variables
		for (const name of variableNames) {
			const val = this.vm.getVar(name);
			if (val !== undefined) {
				variables[name] = val;
			}
		}

		const checkpoint: VMCheckpoint = {
			lineNumber,
			lineId,
			variables,
			parent,
		};
		this.checkpoints.push(checkpoint);
		return checkpoint;
	}

	// ── Restore ──────────────────────────────────────────────────────

	/**
	 * Restore the VM to the state at or just after the given line number.
	 *
	 * Finds the nearest checkpoint whose `lineNumber <= targetLineNumber`,
	 * then replays all variable definitions from root → that checkpoint
	 * into the VM via `setVar()`. The VM's stack is also reset.
	 *
	 * If no checkpoint exists at or before the target line, the VM is
	 * fully reset (empty scope, empty stack).
	 *
	 * **Performance:** O(number of checkpoints × variables per checkpoint).
	 * With prototypal inheritance, `Object.keys()` on each checkpoint
	 * returns only the variables that were set at that checkpoint (not
	 * inherited ones), so the total work is O(total variable definitions
	 * in the document), which is < 100 for typical Obsidian documents.
	 *
	 * @param lineNumber Target 1-based line number. The VM will have the
	 * state that existed AFTER evaluating lines up to `lineNumber`.
	 */
	restoreTo(lineNumber: number): void {
		const target = this.getNearestCheckpoint(lineNumber);
		if (!target) {
			this.vm.reset();
			return;
		}

		// Collect the checkpoint chain from root to target.
		// Walk parent links and reverse so root is first.
		const chain: VMCheckpoint[] = [];
		let current: VMCheckpoint | null = target;
		while (current) {
			chain.unshift(current);
			current = current.parent;
		}

		this.vm.reset();
		for (const cp of chain) {
			// Object.keys() returns only OWN enumerable properties —
			// it does NOT include inherited properties from the prototype chain.
			// This means we only set variables that were defined/updated at this
			// specific checkpoint, not all variables from parent checkpoints.
			for (const key of Object.keys(cp.variables)) {
				this.vm.setVar(key, cp.variables[key]);
			}
		}
	}

	// ── Queries ──────────────────────────────────────────────────────

	/**
	 * Find the nearest checkpoint at or before the given line number.
	 *
	 * Uses linear scan (checkpoints are sorted by lineNumber and the list
	 * is short — typically < 20 for Obsidian documents). Can be upgraded
	 * to binary search if needed for documents with 1000+ variable defs.
	 *
	 * @returns The nearest checkpoint, or null if none exists before the line.
	 */
	getNearestCheckpoint(lineNumber: number): VMCheckpoint | null {
		let result: VMCheckpoint | null = null;
		for (const cp of this.checkpoints) {
			if (cp.lineNumber <= lineNumber) {
				result = cp;
			} else {
				break; // checkpoints are sorted ascending
			}
		}
		return result;
	}

	/**
	 * Get a specific checkpoint by its line number.
	 * @returns The checkpoint, or undefined if not found.
	 */
	getCheckpointAt(lineNumber: number): VMCheckpoint | undefined {
		return this.checkpoints.find((cp) => cp.lineNumber === lineNumber);
	}

	/**
	 * Get the entire checkpoint chain from root to the last checkpoint.
	 * Useful for debugging and serialization.
	 */
	getAllCheckpoints(): readonly VMCheckpoint[] {
		return this.checkpoints;
	}

	/**
	 * Look up a variable's value through the checkpoint chain.
	 *
	 * Walks the prototype chain starting from the most recent checkpoint,
	 * looking for the variable name as an own property. This is O(depth)
	 * where depth is the number of checkpoints since the variable was
	 * last set.
	 *
	 * **Note:** This queries the checkpointer's snapshot, not the VM.
	 * The VM may have been modified since the last snapshot (e.g., by
	 * Tier 2 execution of non-variable-def lines that don't create checkpoints).
	 *
	 * @returns The Value, or undefined if the variable was never set.
	 */
	lookupVariable(name: string): Value | undefined {
		if (this.checkpoints.length === 0) return undefined;

		const latest = this.checkpoints[this.checkpoints.length - 1];
		let scope: Record<string, Value> | null = latest.variables;
		while (scope) {
			if (Object.prototype.hasOwnProperty.call(scope, name)) {
				return scope[name];
			}
			scope = Object.getPrototypeOf(scope) as Record<string, Value> | null;
		}
		return undefined;
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	/**
	 * Clear all checkpoints. The underlying VM is NOT reset — call
	 * `vm.reset()` separately if needed.
	 */
	clear(): void {
		this.checkpoints = [];
	}

	/** Number of checkpoints stored. */
	get count(): number {
		return this.checkpoints.length;
	}

	/** Returns true if no checkpoints have been created. */
	get isEmpty(): boolean {
		return this.checkpoints.length === 0;
	}

	/** The associated VM instance. */
	get vmInstance(): VM {
		return this.vm;
	}
}
