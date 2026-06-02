import type { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import type { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { executeBytecode } from "@solve-js/vm/VM";
import type { VM } from "@solve-js/vm/OpRegistry";
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

	constructor(
		dag: DependencyGraph,
		lineCache: LineCache,
		vm: VM,
		highWaterMark: number = AsyncResolutionBatcher.DEFAULT_HIGH_WATER_MARK,
	) {
		this.dag = dag;
		this.lineCache = lineCache;
		this.vm = vm;

		// ── Create the internal event stream ──
		this._eventStream = new ReadableStream<AsyncResolutionEvent>({
			start: (controller) => {
				this._streamController = controller;
			},
			cancel: () => {
				this._streamController = null;
			},
		}, new CountQueuingStrategy({ highWaterMark }));
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
			queueMicrotask(() => this.flush());
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

	/** Remove all listeners and cancel pending batch. Called on engine clear. */
	clearAll(): void {
		this.pending = [];
		this.scheduled = false;
		this.cleared = true;

		// Clear test capture to match stream-close semantics — after
		// clearAll(), no further events reach old subscribers.
		this._testCaptures = null;

		// Close the stream gracefully so consumers get a clean done signal.
		// New consumers of getEventStream() will get a new stream from the
		// engine's next ctor (engine.clear() recreates the engine).
		try {
			this._streamController?.close();
		} catch {
			// Controller may already be closed or errored.
		}
		this._streamController = null;

		if (this.executionPool) {
			this.executionPool.clear();
			this.executionPool = null;
		}
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
			void this.reExecuteViaWorkerPool(ordered, entryMap, allQueryKeys);
			return;
		}

		const updatedLineNumbers = this.reExecuteMainThread(ordered, allQueryKeys);
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

			this.vm.reset();
			const result = executeBytecode(entry.bytecode, this.vm);

			if (result.type === "value") {
				entry.result = result.value;
				updatedLineNumbers.push(lineNumber);
			}
			// If still pending, don't mark as updated — will be handled by the
			// next resolution batch.
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
