import type { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import type { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { type Value, errorValue } from "@solve-js/vm/Value";
import { executeBytecode } from "@solve-js/vm/VM";
import type { VM } from "@solve-js/vm/OpRegistry";
import { normalizeUnknownError } from "@solve-js/errors/EngineError";
import {
	ExecutionPool,
	WORKER_OFFLOAD_THRESHOLD,
	reconstructValue,
} from "@solve-js/engine/ExecutionPool";

// ── Event types ────────────────────────────────────────────────────────

/** Emitted when one or more lines have updated results after async resolution. */
export interface LinesUpdatedEvent {
	type: "lines-updated";
	/** Line numbers whose results changed (1-based). */
	lineNumbers: number[];
	/** The query keys whose resolution triggered this update. */
	affectedQueryKeys: string[];
}

/** Emitted when an async resolution fails with an error. */
export interface AsyncErrorEvent {
	type: "error";
	/** The query key that failed. */
	queryKey: string;
	/** The package whose resolver failed. */
	packageId: string;
	/** The error that caused the failure. */
	error: Error;
}

export type AsyncResolutionEvent = LinesUpdatedEvent | AsyncErrorEvent;

// ── Internal batch entry ───────────────────────────────────────────────

interface BatchEntry {
	/** The query key that just resolved (or errored). */
	queryKey: string;
	/** The package that owns this data. */
	packageId: string;
	/** AbortSignal for staleness detection. */
	signal: AbortSignal;
	/** Whether this was an error resolution. */
	isError: boolean;
	/** Error if isError. */
	error?: Error;
}

// ── Batcher ────────────────────────────────────────────────────────────

/**
 * Micro-batches async resolution completions into a single DAG walk + re-evaluation pass.
 *
 * When multiple promises resolve within the same event-loop tick (e.g., 3 currency
 * rates: USD→GBP, USD→EUR, USD→JPY all return within 2ms), this batcher collapses
 * them into ONE DAG walk and ONE re-execution pass instead of 3 separate ones.
 *
 * Lifecycle:
 * - Engine calls `add()` after each `resolveAsync()` completes
 * - `queueMicrotask()` schedules `flush()` for the end of the current tick
 * - `flush()` deduplicates queryKeys, walks DAG once for all resolved keys,
 *   topologically sorts affected lines, re-executes, and fires listener events
 *
 * Perf: For N resolutions in a tick, reduces DAG walks from N to 1 and
 * re-executions from N*avgAffected to totalAffected.
 *
 * ## Streaming Architecture
 *	 * Events are published to a native {@link ReadableStream}. Stream-based
	 * consumers read from the stream via `getReader()`, gaining built-in
	 * cancellation (`reader.cancel()`), proper resource cleanup
	 * (`reader.releaseLock()`), and the ability to
	 * `pipeTo()` / `pipeThrough()` / `tee()` the event flow.
 *
 * The stream uses a configurable {@link CountQueuingStrategy} with a default
 * `highWaterMark` of 64 events to limit the internal buffer size.
 */
export class AsyncResolutionBatcher {
	private pending: BatchEntry[] = [];
	private scheduled = false;
	/** Set to true by clearPending() — flush() checks this to abort stale work. */
	private cleared = false;

	private dag: DependencyGraph;
	private lineCache: LineCache;
	private vm: VM;

	/**
	 * Worker pool for offloading VM re-execution when the affected line
	 * count exceeds WORKER_OFFLOAD_THRESHOLD (50). Lazily created on
	 * first dispatch; cleared on clearAll().
	 */
	private executionPool: ExecutionPool | null = null;

	/**
	 * Number of flushes actually dispatched to the worker pool (as opposed
	 * to falling back to the main thread because Worker is unavailable).
	 * Exposed via {@link workerOffloadCount} for the Workers diagnostic tab.
	 */
	private workerOffloadDispatchCount = 0;

	// ── Web Streams API integration ──────────────────────────────────

	/**
	 * Default high-water mark for the internal event stream.
	 * Limits the internal buffer size before the stream signals to
	 * consumers that they need to catch up.
	 */
	private static readonly DEFAULT_HIGH_WATER_MARK = 64;

	/**
	 * Internal {@link ReadableStream} for async resolution events.
	 * All events (lines-updated and error) are enqueued here.
	 */
	private _eventStream: ReadableStream<AsyncResolutionEvent>;

	/**
	 * Controller for the internal event stream. Set during stream
	 * initialization; cleared on stream cancellation or clearAll().
	 */
	private _streamController: ReadableStreamDefaultController<AsyncResolutionEvent> | null = null;

	/**
	 * Test-only synchronous capture array. When enabled (non-null), every
	 * event is synchronously pushed here in addition to the stream.
	 * Tests read from this array to avoid async stream reader timing issues.
	 */
	public _testCaptures: AsyncResolutionEvent[] | null = null;

	/**
	 * Optional hook invoked for each line whose result is patched after an
	 * async resolution (main-thread and worker-pool paths). The view layer
	 * sets this to mirror resolved values straight into its own document
	 * state (DocumentModel) — without it, consumers would have to mark
	 * lines dirty and run a whole re-evaluation pass just to copy values
	 * out of the LineCache. Cleared by clearAll(); re-wire on re-subscribe.
	 */
	onLineResult: ((lineNumber: number, value: Value) => void) | null = null;

	/** High-water mark used when (re)creating the event stream. */
	private readonly highWaterMark: number;

	constructor(
		dag: DependencyGraph,
		lineCache: LineCache,
		vm: VM,
		highWaterMark: number = AsyncResolutionBatcher.DEFAULT_HIGH_WATER_MARK,
	) {
		this.dag = dag;
		this.lineCache = lineCache;
		this.vm = vm;
		this.highWaterMark = highWaterMark;

		this._eventStream = this.createEventStream();
	}

	/**
	 * Create a fresh internal event stream and wire its controller.
	 * Called from the constructor and again from clearAll() so the batcher
	 * keeps emitting events after an engine clear — the engine instance
	 * (and this batcher) live on across clear() calls.
	 */
	private createEventStream(): ReadableStream<AsyncResolutionEvent> {
		return new ReadableStream<AsyncResolutionEvent>({
			start: (controller) => {
				this._streamController = controller;
			},
			cancel: () => {
				this._streamController = null;
			},
		}, new CountQueuingStrategy({ highWaterMark: this.highWaterMark }));
	}

	// ── Public API ────────────────────────────────────────────────────

	/**
	 * Add a resolved query key to the pending batch.
	 *
	 * Called by ExpressionEngine.resolveAsync() after a promise resolves or errors.
	 * If this is the first entry in the current tick, schedules a microtask flush.
	 */
	add(entry: BatchEntry): void {
		// Re-arm after engine clear (clearAll sets cleared=true).
		this.cleared = false;

		// Deduplicate: if the same (packageId:queryKey) is already in the batch, skip.
		// This handles the case where the same data source is resolved multiple times
		// (e.g., fetch → error → retry) within the same tick.
		for (const existing of this.pending) {
			if (existing.packageId === entry.packageId && existing.queryKey === entry.queryKey) {
				return;
			}
		}

		this.pending.push(entry);

		if (!this.scheduled) {
			this.scheduled = true;
			// Hard backstop, deliberately redundant with reExecuteMainThread()'s
			// own per-line try/catch: this runs inside a bare queueMicrotask
			// callback, which has no caller able to catch anything that escapes
			// it — an uncaught throw here becomes an uncaughtException that can
			// crash the host process. flush() is expected to never throw past
			// its own internal per-line containment, but "expected to never" is
			// exactly the assumption that was silently wrong before this pass
			// (see reExecuteMainThread()'s doc comment) — this exists so a
			// FUTURE regression in flush()'s own control flow (topologicalSort(),
			// the DAG walk, an error-listener notification) degrades to a
			// logged, contained failure instead of a repeat of that bug.
			queueMicrotask(() => {
				try {
					this.flush();
				} catch (e) {
					const engineError = normalizeUnknownError(e);
					console.error(`[AsyncResolutionBatcher] flush() failed unexpectedly — this should never happen; please report: ${engineError.format()}`);
				}
			});
		}
	}

	/**
	 * Get the native event stream for stream-based consumers.
	 *
	 * Use this for backpressure, cancellation, or the ability
	 * to `pipeTo()` / `pipeThrough()` the event flow.
	 *
	 * @returns A {@link ReadableStream} that emits {@link AsyncResolutionEvent}
	 *          items as the batcher processes async resolutions.
	 */
	getEventStream(): ReadableStream<AsyncResolutionEvent> {
		return this._eventStream;
	}

	/** Number of resolutions currently queued for the next flush. */
	get pendingCount(): number {
		return this.pending.length;
	}

	/** Number of pending entries collapsed by (packageId, queryKey) deduplication. */
	get dedupCount(): number {
		const dedup = new Set<string>();
		for (const entry of this.pending) {
			dedup.add(`${entry.packageId}:${entry.queryKey}`);
		}
		return Math.max(0, this.pending.length - dedup.size);
	}

	/**
	 * Whether the internal event stream currently has an active reader.
	 * `1` if a consumer has called `getEventStream().getReader()` (or
	 * otherwise locked the stream) and not released it, `0` otherwise.
	 */
	get listenerCount(): number {
		return this._eventStream.locked ? 1 : 0;
	}

	/** Number of flushes that were actually dispatched to the worker pool. */
	get workerOffloadCount(): number {
		return this.workerOffloadDispatchCount;
	}

	/** Remove all listeners and cancel pending batch. Called on engine clear. */
	clearAll(): void {
		this.pending = [];
		this.scheduled = false;
		this.cleared = true;

		// Clear test capture to match stream-close semantics — after
		// clearAll(), no further events reach old subscribers.
		this._testCaptures = null;
		this.onLineResult = null;

		// Close the old stream gracefully so existing consumers get a clean
		// done signal, then create a fresh stream. The engine instance (and
		// this batcher) survive clear(), so getEventStream() must keep
		// returning a live stream for new subscribers.
		try {
			this._streamController?.close();
		} catch {
			// Controller may already be closed or errored.
		}
		this._streamController = null;
		this._eventStream = this.createEventStream();

		if (this.executionPool) {
			this.executionPool.clear();
			this.executionPool = null;
		}

		this.workerOffloadDispatchCount = 0;
	}

	// ── Private: flush ────────────────────────────────────────────────

	/**
	 * Flush all pending resolutions in a single batched pass.
	 *
	 * Called automatically via queueMicrotask. Never called directly.
	 */
	private flush(): void {
		this.scheduled = false;
		if (this.cleared) return; // Engine was cleared — abort stale flush
		if (this.pending.length === 0) return;

		// Take ownership of the pending array (swap with empty).
		const batch = this.pending;
		this.pending = [];

		// Deduplicate by (packageId, queryKey) — keep last entry per key.
		const deduped = new Map<string, BatchEntry>();
		for (const entry of batch) {
			const compositeKey = `${entry.packageId}:${entry.queryKey}`;
			deduped.set(compositeKey, entry);
		}

		// Step 1: Separate errors from successes — but re-evaluate for BOTH.
		// Error entries must also trigger DAG re-evaluation so downstream
		// lines can pick up the Error Value from AsyncResultCache.
		const errorEntries: BatchEntry[] = [];
		const okEntries: BatchEntry[] = [];
		for (const entry of deduped.values()) {
			if (entry.isError) {
				errorEntries.push(entry);
			} else {
				okEntries.push(entry);
			}
		}

		// Notify error listeners first (before re-evaluation).
		for (const entry of errorEntries) {
			if (entry.signal.aborted) continue;
			this.notifyListeners({
				type: "error",
				queryKey: entry.queryKey,
				packageId: entry.packageId,
				error: entry.error ?? new Error("Unknown async resolution error"),
			});
		}

		// Step 2: Single DAG walk — collect ALL affected lines from ALL resolved
		// queryKeys (both success AND error). Errors also need re-evaluation so
		// downstream lines can receive errorValue() results.
		const allAffected = new Set<number>();
		const allQueryKeys: string[] = [];

		const allEntries = [...okEntries, ...errorEntries];
		for (const entry of allEntries) {
			if (entry.signal.aborted) continue;
			allQueryKeys.push(entry.queryKey);

			const affected = this.dag.getAffectedLinesByDataSource(
				entry.packageId,
				[entry.queryKey],
			);
			for (const line of affected) {
				allAffected.add(line);
			}
		}

		if (allAffected.size === 0) {
			// No lines affected — still notify listeners so UI can update
			// (e.g., clear loading indicators).
			this.notifyListeners({
				type: "lines-updated",
				lineNumbers: [],
				affectedQueryKeys: allQueryKeys,
			});
			return;
		}

		// Step 3: Topological sort affected lines.
		// We need to re-evaluate in dependency order so that variable producers
		// execute before their consumers. We use getAffectedLinesInOrder() but
		// that requires a starting variable. Instead, we do our own Kahn's algo
		// on the subgraph of affected lines.
		const ordered = this.topologicalSort(Array.from(allAffected));

		// Step 4: Re-execute all affected lines.
		// For ≤50 lines: main-thread synchronous loop (fast, no worker overhead).
		// For >50 lines: offload to worker pool to avoid UI freeze.
		if (ordered.length > WORKER_OFFLOAD_THRESHOLD) {
			// Build a Map for fast entry lookup in the worker dispatch path.
			const entryMap = new Map<number, ReturnType<LineCache["getEntryForLine"]>>();
			for (const lineNumber of ordered) {
				entryMap.set(lineNumber, this.lineCache.getEntryForLine(lineNumber));
			}
			// .catch() is required, not optional: reExecuteViaWorkerPool() is an
			// async method dispatched with `void` (fire-and-forget) — without a
			// handler here, a rejection (a worker crash, `executionPool.executeBatch`
			// throwing) becomes an unhandled promise rejection, the async
			// equivalent of the uncaught-exception risk `add()`'s queueMicrotask
			// backstop guards against for the synchronous path.
			void this.reExecuteViaWorkerPool(ordered, entryMap, allQueryKeys).catch((e) => {
				const engineError = normalizeUnknownError(e);
				console.error(`[AsyncResolutionBatcher] reExecuteViaWorkerPool() failed unexpectedly: ${engineError.format()}`);
			});
			return;
		}

		this.reExecuteMainThread(ordered, allQueryKeys);
	}

	// ── Private: topological sort ─────────────────────────────────────

	/**
	 * Topologically sort affected lines using Kahn's algorithm.
	 *
	 * Lines that produce variables come before lines that consume them.
	 * This ensures correct evaluation order when multiple interdependent
	 * lines are affected by async resolution.
	 */
	private topologicalSort(lines: number[]): number[] {
		if (lines.length <= 1) return lines;

		// Build in-degree map and producer lookup.
		const inDegree = new Map<number, number>();
		const adjacency = new Map<number, number[]>();

		// Variable → producing line number (within affected set).
		const producerOf = new Map<string, number>();

		for (const line of lines) {
			inDegree.set(line, 0);
			adjacency.set(line, []);
		}

		// First pass: identify which variables are produced by which affected lines.
		for (const line of lines) {
			const writes = this.dag.getWrites(line);
			for (const w of writes) {
				producerOf.set(w, line);
			}
		}

		// Second pass: build edges from producer → consumer.
		for (const line of lines) {
			const reads = this.dag.getDependencies(line);
			for (const readVar of reads) {
				const producer = producerOf.get(readVar);
				if (producer !== undefined && producer !== line) {
					adjacency.get(producer)!.push(line);
					inDegree.set(line, (inDegree.get(line) ?? 0) + 1);
				}
			}
		}

		// Kahn's algorithm.
		const queue: number[] = [];
		for (const [line, degree] of inDegree) {
			if (degree === 0) queue.push(line);
		}

		// Fallback: if all lines have dependencies (cycles), sort by line number.
		if (queue.length === 0 && lines.length > 0) {
			return [...lines].sort((a, b) => a - b);
		}

		const ordered: number[] = [];
		while (queue.length > 0) {
			const current = queue.shift()!;
			ordered.push(current);

			for (const downstream of adjacency.get(current) ?? []) {
				const newDegree = (inDegree.get(downstream) ?? 1) - 1;
				inDegree.set(downstream, newDegree);
				if (newDegree === 0) queue.push(downstream);
			}
		}

		// Append unresolvable lines (cycles).
		if (ordered.length < lines.length) {
			const remaining = lines
				.filter((l) => !ordered.includes(l))
				.sort((a, b) => a - b);
			ordered.push(...remaining);
		}

		return ordered;
	}

	// ── Private: worker-pool re-execution ─────────────────────────────

	/**
	 * Offload VM re-execution to the worker pool for large batches.
	 *
	 * Called when ordered.length > WORKER_OFFLOAD_THRESHOLD (50).
	 * Clones bytecode ArrayBuffers, dispatches to workers, and asynchronously
	 * patches results back into LineCache before notifying listeners.
	 *
	 * Handles pending results: lines that return { type: 'pending' } from the
	 * worker are NOT marked as updated — the engine's resolveAsync will handle
	 * them when the async resolver completes.
	 *
	 * Safety: checks this.cleared before applying results — if the engine was
	 * cleared while the worker batch was in-flight, results are discarded.
	 */
	private async reExecuteViaWorkerPool(
		ordered: number[],
		entryMap: Map<number, ReturnType<LineCache["getEntryForLine"]>>,
		allQueryKeys: string[],
	): Promise<void> {
		// Lazily create the pool on first use.
		if (!this.executionPool) {
			this.executionPool = new ExecutionPool();
		}

		const results = this.executionPool.executeBatch(ordered, entryMap);

		// If workers are unavailable (Node.js, SSR, test env without jsdom
		// worker support), executeBatch returns undefined. Fall back to
		// main-thread execution.
		if (!results) {
			this.reExecuteMainThread(ordered, allQueryKeys, entryMap);
			return;
		}

		this.workerOffloadDispatchCount++;

		// Await worker results.
		const workerResults = await results;

		// Guard: if engine was cleared while the worker batch was in-flight,
		// discard results — the LineCache/DAG are stale.
		if (this.cleared) return;

		// Patch results back into LineCache.
		const updatedLineNumbers: number[] = [];
		for (const wr of workerResults) {
			const entry = entryMap.get(wr.lineNumber);
			if (!entry) continue;

			if (wr.isPending) {
				// Don't mark as updated — will be resolved in a future batch.
				continue;
			}

			// Reconstruct Value from serialized result.
			const value = reconstructValue(wr);
			entry.result = value;
			this.onLineResult?.(wr.lineNumber, value);
			updatedLineNumbers.push(wr.lineNumber);
		}

		// Notify listeners (only if not cleared during await).
		if (this.cleared) return;
		if (updatedLineNumbers.length > 0 || allQueryKeys.length > 0) {
			this.notifyListeners({
				type: "lines-updated",
				lineNumbers: updatedLineNumbers,
				affectedQueryKeys: allQueryKeys,
			});
		}
	}

	// ── Private: main-thread re-execution ────────────────────────────

	/**
	 * Execute ordered lines on the main thread, update LineCache, and notify
	 * listeners. Returns the list of line numbers that actually changed.
	 *
	 * Used by both flush() (≤50 lines) and reExecuteViaWorkerPool() (fallback
	 * when workers are unavailable). Extracted to avoid code duplication.
	 *
	 * **Per-line containment (fatal-bug fix)**: `executeBytecode()` used to
	 * run here with NO try/catch anywhere in this method's call chain, and
	 * this whole batch runs inside a bare `queueMicrotask` (see `add()`) with
	 * no surrounding try/catch at any caller either — so if any ONE line's
	 * cached bytecode threw (a stack/instruction-limit error, an undefined
	 * variable, a corrupted-bytecode `TypeError`), the `for` loop aborted
	 * immediately: every line scheduled AFTER the failure in this batch was
	 * silently never re-executed or notified even though nothing was wrong
	 * with them, every line BEFORE it had already had its `entry.result`
	 * mutated in-place but `notifyListeners()` was never reached (a silent
	 * `LineCache`/host desync), and — because a bare `queueMicrotask`
	 * callback has no caller to catch it — the exception was uncatchable:
	 * an `uncaughtException` that could crash the host process outright.
	 * (`__tests__/async/AsyncResolutionBatcher.spec.ts`'s topological-sort
	 * describe block used to have a test skipped specifically because of
	 * this — see that file, now un-skipped and rewritten.) Each line's
	 * execution is now its own try/catch: a failure is recorded as an
	 * `Error` `Value` for THAT line (still counted as "updated" so the host
	 * learns about it and stops showing a stale Pending state) and the loop
	 * continues — one line's failure can no longer take out its neighbors.
	 */
	private reExecuteMainThread(
		ordered: number[],
		allQueryKeys: string[],
		entryMap?: Map<number, LineCacheEntry | undefined>,
	): number[] {
		const updatedLineNumbers: number[] = [];

		for (const lineNumber of ordered) {
			const entry = entryMap
				? entryMap.get(lineNumber)
				: this.lineCache.getEntryForLine(lineNumber);
			if (!entry || entry.bytecode.opcodes.length === 0) continue;

			// Do NOT reset the VM here: reset() clears the variable table, which
			// would wipe values produced by earlier lines in this topologically
			// ordered batch (and by unaffected lines outside it). Instead, mirror
			// the engine's execution pattern: snapshot the stack depth and pop
			// back to it after execution.
			const stackBefore = this.vm.getStack().length;
			try {
				const result = executeBytecode(entry.bytecode, this.vm);
				while (this.vm.getStack().length > stackBefore) {
					this.vm.pop();
				}

				if (result.type === "value") {
					entry.result = result.value;
					this.onLineResult?.(lineNumber, result.value);
					updatedLineNumbers.push(lineNumber);
				} else if (result.type === "error") {
					// executeBytecode() reports controlled failures (undefined
					// variable, stack/instruction limits, a plugin throw) as this
					// {type:'error'} return value now, not a thrown exception — the
					// catch block below only remains as a backstop for whatever
					// still throws outside that contract (e.g. a bug in the
					// stack-cleanup loop itself). Without this branch, a VM-level
					// error here fell through both the "value" and "pending" cases
					// silently: no entry.result update, no onLineResult, not counted
					// in updatedLineNumbers — the same class of silent-drop bug this
					// method's containment fix exists to prevent, just moved one
					// level up from "uncaught exception" to "unhandled Result arm".
					const value = errorValue(result.error.code, result.error.message);
					entry.result = value;
					this.onLineResult?.(lineNumber, value);
					updatedLineNumbers.push(lineNumber);
				}
				// If still pending, don't mark as updated — will be handled by the
				// next resolution batch.
			} catch (e) {
				// Restore the stack to its pre-execution depth even on failure —
				// a partially-executed opcode sequence may have pushed values it
				// never got to pop, and leaving them would corrupt every
				// subsequent line's execution in this same shared VM.
				while (this.vm.getStack().length > stackBefore) {
					this.vm.pop();
				}
				const engineError = normalizeUnknownError(e);
				const value = errorValue(engineError.code, engineError.message);
				entry.result = value;
				this.onLineResult?.(lineNumber, value);
				updatedLineNumbers.push(lineNumber);
			}
		}

		// Notify listeners of updated lines.
		if (updatedLineNumbers.length > 0 || allQueryKeys.length > 0) {
			this.notifyListeners({
				type: "lines-updated",
				lineNumbers: updatedLineNumbers,
				affectedQueryKeys: allQueryKeys,
			});
		}

		return updatedLineNumbers;
	}

	/**
	 * Notify all consumers of an async resolution event.
	 *
	 * Enqueues the event into the internal {@link ReadableStream}.
	 * If the stream has been closed or errored (consumer cancelled),
	 * the enqueue silently fails (caught by try/catch).
	 */
	private notifyListeners(event: AsyncResolutionEvent): void {
		// Test capture — synchronous, no timing issues (enabled only in tests).
		if (this._testCaptures) {
			this._testCaptures.push(event);
		}

		if (this._streamController) {
			try {
				this._streamController.enqueue(event);
			} catch {
				// Stream closed or errored — consumer may have cancelled.
			}
		}
	}
}
