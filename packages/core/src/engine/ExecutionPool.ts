/**
 * ExecutionPool — manages a pool of execution workers for offloading
 * VM bytecode re-execution when AsyncResolutionBatcher.flush() has >50
 * affected lines.
 *
 * Workers are created lazily (on first dispatch). Each worker runs
 * executeBytecode() with its own isolated VM — no shared state between
 * worker and main thread, no scope leakage.
 *
 * Design decisions:
 * - Pool size: Math.min(navigator.hardwareConcurrency ?? 4, 4). Capped at
 *   4 to avoid excessive thread creation on high-core machines.
 * - Round-robin dispatch distributes batches evenly across workers.
 * - Workers are terminated on pool.clear() (engine clear) and recreated
 *   lazily on next dispatch.
 * - Falls back to synchronous main-thread execution when Worker is
 *   unavailable (Node.js, SSR, testing without jsdom worker support).
 *
 * Transferable protocol (shares engine.worker.ts with CompilationWorkerManager):
 * - Main thread clones bytecode ArrayBuffers via .slice() per entry
 * - Transfers cloned buffers to worker (zero-copy, detached on main side)
 * - Worker receives buffers, reconstructs TypedArrays, executes, returns
 *   serialized results (plain objects with numbers/strings)
 *
 * Message protocol:
 *   Pool → Worker: { type: "EXECUTE_BATCH", id, items: ExecuteItem[] }
 *   Worker → Pool: { id, type: "EXECUTE_RESULT", results: ExecuteResult[] }
 */

import type { LineCacheEntry } from "@solve-js/cache/LineCache";
import { ValueType } from "@solve-js/vm/Value";
import { numberValue, uomValue, hexValue, bigIntValue, stringValue, boolValue, datetimeValue, percentageValue, errorValue, pendingValue } from "@solve-js/vm/Value";
import type { Value } from "@solve-js/vm/Value";

/** Timeout for worker batch execution (30s). If exceeded, returns empty results. */
const WORKER_BATCH_TIMEOUT_MS = 30_000;

// ── Static import of the inline worker factory ────────────────────────────
// esbuild-plugin-inline-worker transforms this into a function that
// returns Worker (using blob URL or equivalent). At build time it's a
// factory; at dev time it throws.
import createExecutionWorker from "@solve-js/workers/engine.worker";

// ── Worker message types (mirrors the EXECUTE_* shapes in engine.worker.ts) ──

interface ExecuteItem {
	lineNumber: number;
	opcodesBuffer: ArrayBuffer;
	numbersBuffer: ArrayBuffer;
	opcodesLength: number;
	numbersLength: number;
	strings: string[];
}

interface ExecuteResult {
	lineNumber: number;
	valueType: ValueType;
	value: number;
	unit?: string;
	isPending: boolean;
	queryKey?: string;
}

// ── Batch tracking ────────────────────────────────────────────────────────

interface PendingBatch {
	/** Correlation ID sent to the worker. */
	id: number;
	/** Line numbers in this batch (in order). Used for result correlation. */
	lineNumbers: number[];
	/** Resolve when results arrive. */
	resolve: (results: ExecuteResult[]) => void;
}

/** Number of affected lines before we offload to worker pool. */
export const WORKER_OFFLOAD_THRESHOLD = 50;

// ── Pool ──────────────────────────────────────────────────────────────────

export class ExecutionPool {
	private workers: Worker[] = [];
	private nextWorker = 0;
	private nextId = 1;
	private pendingBatches = new Map<number, PendingBatch>();
	private terminated = false;
	private poolSize: number;

	constructor(poolSize?: number) {
		this.poolSize = Math.min(poolSize ?? this.defaultPoolSize(), 4);
	}

	private defaultPoolSize(): number {
		if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
			return Math.min(navigator.hardwareConcurrency, 4);
		}
		return 2;
	}

	// ── Public API ────────────────────────────────────────────────────────

	/** Cached availability flag. Checked once; createExecutionWorker never called again. */
	private _available: boolean | null = null;

	/**
	 * Whether worker-based execution is available.
	 * Returns false in Node.js / jsdom test environments where Worker
	 * may be polyfilled but execution workers aren't functional.
	 */
	isAvailable(): boolean {
		if (this.terminated) return false;
		if (this._available !== null) return this._available;
		if (typeof Worker === "undefined") {
			this._available = false;
			return false;
		}
		try {
			// Create a test worker, then immediately terminate it.
			const w = createExecutionWorker();
			w.terminate();
			this._available = true;
			return true;
		} catch {
			this._available = false;
			return false;
		}
	}

	/**
	 * Execute a batch of line entries via the worker pool.
	 *
	 * Takes ordered line numbers and their LineCache entries. Clones bytecode
	 * ArrayBuffers for transfer, dispatches to workers round-robin, and
	 * returns the serialized results (with 30s timeout fallback).
	 *
	 * Falls back to undefined when workers are unavailable — caller should
	 * use the main-thread path.
	 *
	 * @returns ExecuteResult[] on success, undefined if workers unavailable.
	 */
	executeBatch(
		orderedLineNumbers: number[],
		entries: Map<number, LineCacheEntry | undefined>,
	): Promise<ExecuteResult[]> | undefined {
		if (!this.isAvailable()) return undefined;
		if (orderedLineNumbers.length === 0) return Promise.resolve([]);

		// Lazy-initialize workers
		this.ensureWorkers();

		// Clone bytecode buffers for transfer. Each worker needs its own
		// copy because transfer detaches the ArrayBuffer on the sender side.
		const items: ExecuteItem[] = [];
		for (const lineNumber of orderedLineNumbers) {
			const entry = entries.get(lineNumber);
			if (!entry || entry.bytecode.opcodes.length === 0) continue;

			const opcodes = entry.bytecode.opcodes;
			const numbers = entry.bytecode.numbers;

			// Clone the exact used slice of each ArrayBuffer for transfer.
			// After transfer, the clone is detached on the main thread —
			// the original LineCache entry's buffers are untouched.
			const opcodesClone = opcodes.buffer.slice(
				opcodes.byteOffset,
				opcodes.byteOffset + opcodes.byteLength,
			) as ArrayBuffer;
			const numbersClone = numbers.buffer.slice(
				numbers.byteOffset,
				numbers.byteOffset + numbers.byteLength,
			) as ArrayBuffer;

			items.push({
				lineNumber,
				opcodesBuffer: opcodesClone,
				numbersBuffer: numbersClone,
				opcodesLength: opcodes.length,
				numbersLength: numbers.length,
				strings: [...entry.bytecode.strings],
			});
		}

		if (items.length === 0) return Promise.resolve([]);

		// Collect transferable ArrayBuffers for zero-copy postMessage.
		const transferList: ArrayBuffer[] = [];
		for (const item of items) {
			if (item.opcodesBuffer.byteLength > 0) transferList.push(item.opcodesBuffer);
			if (item.numbersBuffer.byteLength > 0) transferList.push(item.numbersBuffer);
		}

		const batchId = this.nextId++;
		const worker = this.getNextWorker();

		return new Promise<ExecuteResult[]>((resolve) => {
			// Timeout guard: if worker hangs (infinite bytecode loop despite
			// VM instruction limit), resolve with empty results after 30s.
			const timeoutId = setTimeout(() => {
				this.pendingBatches.delete(batchId);
				resolve([]);
			}, WORKER_BATCH_TIMEOUT_MS);

			this.pendingBatches.set(batchId, {
				id: batchId,
				lineNumbers: orderedLineNumbers,
				resolve: (results: ExecuteResult[]) => {
					clearTimeout(timeoutId);
					resolve(results);
				},
			});

			worker.postMessage(
				{ type: "EXECUTE_BATCH", id: batchId, items },
				transferList,
			);
		});
	}

	/**
	 * Clean up all workers and pending batches. Called on engine clear.
	 * Workers are recreated lazily on next dispatch.
	 */
	clear(): void {
		// Reject all pending batches
		for (const [, batch] of this.pendingBatches) {
			batch.resolve([]);
		}
		this.pendingBatches.clear();

		// Terminate all workers
		for (const w of this.workers) {
			w.terminate();
		}
		this.workers = [];
		this.nextWorker = 0;
	}

	/**
	 * Full teardown. After destroy(), the pool is permanently unusable.
	 */
	destroy(): void {
		this.terminated = true;
		this.clear();
	}

	// ── Private ────────────────────────────────────────────────────────────

	private ensureWorkers(): void {
		if (this.workers.length > 0) return;

		for (let i = 0; i < this.poolSize; i++) {
			const worker = createExecutionWorker();
			worker.onmessage = (event: MessageEvent) => {
				this.handleWorkerMessage(event.data);
			};
			worker.onerror = (err: ErrorEvent) => {
				console.error(`[ExecutionPool] Worker ${i} error:`, err.message);
				// Resolve ALL pending batches with empty results so callers
				// don't hang. Any in-flight execution results are lost, but
				// the batcher will re-evaluate on next resolution.
				for (const [id, batch] of this.pendingBatches) {
					batch.resolve([]);
					this.pendingBatches.delete(id);
				}
			};
			this.workers.push(worker);
		}
	}

	private getNextWorker(): Worker {
		const w = this.workers[this.nextWorker];
		this.nextWorker = (this.nextWorker + 1) % this.workers.length;
		return w;
	}

	private handleWorkerMessage(data: { id: number; type: string; results: ExecuteResult[] }): void {
		if (data.type !== "EXECUTE_RESULT") return;

		const batch = this.pendingBatches.get(data.id);
		if (!batch) return;

		this.pendingBatches.delete(data.id);
		batch.resolve(data.results);
	}
}

// ── Value reconstruction helpers ──────────────────────────────────────────

/**
 * Reconstruct a Value object from a serialized ExecuteResult.
 *
 * Called on the main thread after worker execution completes.
 * Maps ValueType → appropriate constructor function.
 */
export function reconstructValue(result: ExecuteResult): Value {
	switch (result.valueType) {
		case ValueType.Number:
			return numberValue(result.value);
		case ValueType.Hex:
			return hexValue(result.value);
		case ValueType.BigInt:
			return bigIntValue(BigInt(result.value));
		case ValueType.String:
			return stringValue(String(result.value));
		case ValueType.Datetime:
			return datetimeValue(result.value);
		case ValueType.Percentage:
			return percentageValue(result.value);
		case ValueType.Uom:
			return uomValue(result.value, result.unit ?? "");
		case ValueType.Matrix:
			// Pre-existing simplification carried over from the old Array
			// type: the worker-pool's {valueType, value, unit} serialization
			// has no slot for MatrixData's rows/cols/data shape, so a Matrix
			// result degrades to a plain number here rather than round-
			// tripping intact. Not fixed as part of Matrix support — this
			// gap already existed for vectors before this rename.
			return numberValue(result.value);
		case ValueType.Boolean:
			return boolValue(result.value !== 0);
		case ValueType.Pending:
			return pendingValue(result.queryKey ?? "");
		case ValueType.Error:
			return errorValue("WORKER_EXECUTION_ERROR", result.unit ?? "Unknown worker error");
		default:
			return numberValue(result.value);
	}
}
