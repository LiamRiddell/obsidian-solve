import { Value } from "@solve-js/vm/Value";

/**
 * Process-wide store for `global :name` variables — distinct from, and
 * unrelated to, the per-document `Map<string, Value>` each VM instance owns
 * for ordinary `:x` variables (see VM.ts's `createVM()`). Every document's
 * VM stays fully isolated for local variables; this is the one deliberate
 * exception, shared across every ExpressionEngine in the same JS realm.
 *
 * Also distinct from `sharedVariableResolver` (variables/VariableResolver.ts)
 * — that mechanism is for package-contributed async data sources (currency
 * rates, OSRS prices) and is never queried by LOAD_VAR/STORE_VAR today. This
 * store backs a completely separate opcode pair (LOAD_GLOBAL_VAR/
 * STORE_GLOBAL_VAR) and is the synchronous fast-path cache underneath
 * GlobalVariableAsyncResolver, which handles the "not yet declared by any
 * loaded document" case via the engine's existing async-resolution pipeline
 * (see that file's doc comment for the full picture).
 */
export class GlobalVariableStore {
	private values = new Map<string, Value>();
	private listeners = new Set<GlobalVariableListener>();

	/**
	 * Guards against runaway cross-document write cycles: doc A's write
	 * notifies doc B, whose dirty line — once evaluated — writes a global
	 * that notifies doc C, ... eventually back to A. Same philosophy as the
	 * VM's own instruction-limit safety net: stop propagating past the
	 * limit rather than let a genuine cycle recurse unboundedly. The store
	 * itself is left in a well-defined state either way — this only bounds
	 * *notification* depth, never the value actually stored.
	 */
	private static readonly MAX_NOTIFY_DEPTH = 64;
	private notifyDepth = 0;

	get(name: string): Value | undefined {
		return this.values.get(name);
	}

	has(name: string): boolean {
		return this.values.has(name);
	}

	/**
	 * Last-write-wins: any document may call this for any name at any time.
	 * Notifies listeners synchronously — within the same call, before
	 * returning — so that ThreeTierEvaluator's dirty-marking (a listener)
	 * and GlobalVariableAsyncResolver's first-write promise (also a
	 * listener) both observe the new value immediately, no microtask delay.
	 *
	 * A write that does not CHANGE the stored value notifies nobody. This
	 * is not just an optimisation — it is what stops a re-evaluation cycle
	 * from sustaining itself. Every listener re-runs work in response to a
	 * write (ThreeTierEvaluator marks dependent lines dirty; the playground
	 * worker refreshes other documents), and those re-runs re-execute the
	 * very STORE_GLOBAL_VAR opcode that produced this write. Re-evaluating
	 * an unchanged `global :x = 5` line therefore used to re-notify, which
	 * re-triggered the listeners, which re-evaluated... — bounded only by
	 * MAX_NOTIFY_DEPTH below, and only in DEPTH, so with more than one
	 * writer the work per keystroke grew exponentially. Nothing observable
	 * changed, so there is nothing for a listener to react to.
	 */
	set(name: string, value: Value): void {
		const previous = this.values.get(name);
		this.values.set(name, value);
		if (previous !== undefined && sameValue(previous, value)) return;
		this.notify(name, value);
	}

	private notify(name: string, value: Value): void {
		if (this.notifyDepth >= GlobalVariableStore.MAX_NOTIFY_DEPTH) return;
		this.notifyDepth++;
		try {
			for (const listener of this.listeners) listener(name, value);
		} finally {
			this.notifyDepth--;
		}
	}

	/**
	 * Subscribe to every global-variable write (all names — callers filter
	 * for the name(s) they care about). Returns an unsubscribe function;
	 * callers MUST invoke it when disposing (e.g. ThreeTierEvaluator's
	 * terminateWorker()) to avoid leaking listeners for closed documents.
	 */
	subscribe(listener: GlobalVariableListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Full reset — test-only. Never called from production code paths;
	 * globals must outlive any single engine's own clear()/dispose cycle.
	 * Tests MUST call this in beforeEach/afterEach since this is a
	 * module-level singleton whose state and listeners otherwise leak
	 * across test cases and files.
	 */
	clear(): void {
		this.values.clear();
		this.listeners.clear();
		this.notifyDepth = 0;
	}
}

/**
 * Structural equality for two stored globals, used by `set()` to decide
 * whether a write is worth notifying about. Deliberately NOT identity:
 * VM.ts stores `persistentValue(val)` — a fresh object — on every
 * STORE_GLOBAL_VAR while the arena is active, so two writes of the same
 * literal are never the same object.
 *
 * `Object.is` rather than `===` so a global holding NaN compares equal to
 * itself; otherwise `global :x = 0/0` would re-notify on every
 * re-evaluation, which is exactly the cycle `set()` is trying to break.
 */
function sameValue(a: Value, b: Value): boolean {
	if (a.type !== b.type) return false;
	if (a.unit !== b.unit) return false;
	if ((a.timedOut ?? false) !== (b.timedOut ?? false)) return false;

	const av = a.value;
	const bv = b.value;
	if (Array.isArray(av) || Array.isArray(bv)) {
		if (!Array.isArray(av) || !Array.isArray(bv)) return false;
		if (av.length !== bv.length) return false;
		for (let i = 0; i < av.length; i++) {
			if (!Object.is(av[i], bv[i])) return false;
		}
		return true;
	}
	return Object.is(av, bv);
}

export type GlobalVariableListener = (name: string, value: Value) => void;

/** Process-wide singleton — same sharing pattern as sharedVariableResolver. */
export const sharedGlobalVariableStore = new GlobalVariableStore();

/**
 * DAG bookkeeping key for a `global :name` reference, distinct from the
 * plain `name` key used for a local `:name` — so a single document that
 * reads/writes BOTH a local `:hello` and `global :hello` never collides
 * them in that document's own DependencyGraph reads/writes tracking. This
 * prefix exists ONLY at the DAG-bookkeeping layer (ExpressionEngineSafety's
 * extractReadsAndWrites, and ThreeTierEvaluator's dirty-marking subscriber)
 * — the VM-level storage key in this store, and the LOAD_GLOBAL_VAR/
 * STORE_GLOBAL_VAR bytecode operand, both stay unprefixed.
 */
export function globalDagKey(name: string): string {
	return `global:${name}`;
}
