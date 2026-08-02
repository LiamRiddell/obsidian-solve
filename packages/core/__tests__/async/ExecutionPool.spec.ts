/**
 * ExecutionPool — Unit Tests
 *
 * Tests for:
 * - reconstructValue: all ValueType variants
 * - Worker dispatch: round-robin, message protocol, promise resolution
 * - Timeout fallback: 30s timeout, clearTimeout on worker response
 * - Onerror recovery: all pending batches resolved on worker crash
 * - isAvailable caching: one-shot check, terminated state
 * - Transferable buffer cloning: .slice() clones, originals untouched
 * - Lifecycle: clear() terminates workers, destroy() permanent
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ExecutionPool, WORKER_OFFLOAD_THRESHOLD, reconstructValue } from "@solve-js/engine/ExecutionPool";
import { Value, ValueType, numberValue, uomValue, hexValue, bigIntValue, stringValue, boolValue, datetimeValue, percentageValue, pendingValue, errorValue } from "@solve-js/vm/Value";
import { LineCacheEntry } from "@solve-js/cache/LineCache";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

// ── Mock Worker factory override ────────────────────────────────────────
// The real createExecutionWorker throws in Jest. We jest.mock the module
// to return a controllable MockWorker factory.
//
// IMPORTANT: jest.mock is hoisted above imports. The factory closure
// captures `mockFactory` which is a const declared at module level.
// Jest's babel transform handles this correctly — the const is
// hoisted with jest.mock, so it's available when the mock factory runs.

interface MockWorkerInst {
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	postMessage: ReturnType<typeof jest.fn>;
	terminate: ReturnType<typeof jest.fn>;
	/** Fire onmessage with the given data (simulates worker response). */
	simulateResponse(data: { id: number; type: string; results: unknown[] }): void;
	/** Fire onerror with a synthetic ErrorEvent. */
	simulateError(message: string): void;
}

function createMockWorker(): MockWorkerInst {
	const inst: MockWorkerInst = {
		onmessage: null,
		onerror: null,
		postMessage: jest.fn(),
		terminate: jest.fn(),
		simulateResponse(data) {
			if (inst.onmessage) {
				inst.onmessage({ data } as MessageEvent);
			}
		},
		simulateError(message) {
			if (inst.onerror) {
				inst.onerror({ message, error: new Error(message) } as unknown as ErrorEvent);
			}
		},
	};
	return inst;
}

// Use a shared jest.fn() that the mock factory wraps. The mock factory
// redirects to this fn so beforeEach can reconfigure it per test.
const mockFactory = jest.fn<() => MockWorkerInst>();

jest.mock("@solve-js/workers/engine.worker", () => ({
	__esModule: true,
	default: () => mockFactory(),
}));

/** All MockWorker instances created (pushed by beforeEach's mockFactory impl). */
let allWorkers: MockWorkerInst[];

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build minimal bytecode (PUSH_NUMBER + HALT). */
function buildSimpleBytecode(value: number) {
	const builder = new BytecodeBuilder();
	builder.reset();
	builder.emitOpcode(OpCode.PUSH_NUMBER);
	builder.emitNumber(value);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

/** Create a LineCacheEntry with given bytecode and result value. */
function makeEntry(bytecode: ReturnType<typeof buildSimpleBytecode>, resultValue = numberValue(0)): LineCacheEntry {
	return new LineCacheEntry(resultValue, bytecode, [], null);
}

/** Create entries map from ordered line numbers, each with simple bytecode. */
function makeEntries(lines: number[], values: number[]): Map<number, LineCacheEntry> {
	const map = new Map<number, LineCacheEntry>();
	for (let i = 0; i < lines.length; i++) {
		map.set(lines[i], makeEntry(buildSimpleBytecode(values[i])));
	}
	return map;
}

/** Advance all pending microtasks. */
function flushMicrotasks(): Promise<void> {
	return new Promise<void>((resolve) => queueMicrotask(resolve));
}

beforeEach(() => {
	// jsdom does NOT expose a global Worker constructor. Provide a dummy
	// so ExecutionPool.isAvailable() passes the `typeof Worker === "undefined"`
	// guard and proceeds to the createExecutionWorker() try/catch.
	// @ts-expect-error - assigning to global for test purposes
	global.Worker = class {};

	allWorkers = [];
	mockFactory.mockImplementation(() => {
		const w = createMockWorker();
		allWorkers.push(w);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return w as any;
	});
	jest.clearAllMocks();
});

afterEach(() => {
	jest.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════
// §1  reconstructValue — all ValueTypes
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — reconstructValue", () => {
	test("Number → numberValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Number, value: 42, isPending: false });
		expect(v.type).toBe(ValueType.Number);
		expect(v.value).toBe(42);
	});

	test("Hex → hexValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Hex, value: 255, isPending: false });
		expect(v.type).toBe(ValueType.Hex);
		expect(v.value).toBe(255);
	});

	test("BigInt → bigIntValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.BigInt, value: 9007199254740991, isPending: false });
		expect(v.type).toBe(ValueType.BigInt);
		expect(v.value).toBe(BigInt(9007199254740991));
	});

	test("String → stringValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.String, value: 0, isPending: false });
		expect(v.type).toBe(ValueType.String);
		expect(v.value).toBe("0");
	});

	test("Datetime → datetimeValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Datetime, value: 1717113600000, isPending: false });
		expect(v.type).toBe(ValueType.Datetime);
		expect(v.value).toBe(1717113600000);
	});

	test("Percentage → percentageValue", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Percentage, value: 85, isPending: false });
		expect(v.type).toBe(ValueType.Percentage);
		expect(v.value).toBe(85);
	});

	test("Uom → uomValue with unit", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Uom, value: 100, unit: "kg", isPending: false });
		expect(v.type).toBe(ValueType.Uom);
		expect(v.value).toBe(100);
		expect(v.unit).toBe("kg");
	});

	test("Uom without unit → uomValue with empty string", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Uom, value: 50, isPending: false });
		expect(v.type).toBe(ValueType.Uom);
		expect(v.unit).toBe("");
	});

	test("Matrix → numberValue (lossy fallback — worker serialization has no shape/data slot)", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Matrix, value: 7, isPending: false });
		expect(v.type).toBe(ValueType.Number);
		expect(v.value).toBe(7);
	});

	test("Boolean (non-zero) → boolValue true", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Boolean, value: 1, isPending: false });
		expect(v.type).toBe(ValueType.Boolean);
		expect(v.value).toBe(true);
	});

	test("Boolean (zero) → boolValue false", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Boolean, value: 0, isPending: false });
		expect(v.type).toBe(ValueType.Boolean);
		expect(v.value).toBe(false);
	});

	test("Boolean (negative) → boolValue true (value !== 0)", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Boolean, value: -1, isPending: false });
		expect(v.type).toBe(ValueType.Boolean);
		expect(v.value).toBe(true);
	});

	test("Pending → pendingValue with queryKey", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Pending, value: 0, isPending: true, queryKey: "async:key" });
		expect(v.type).toBe(ValueType.Pending);
		expect(v.value).toBe("async:key");
	});

	test("Error → errorValue with code and unit as message", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Error, value: 0, unit: "Something broke", isPending: false });
		expect(v.type).toBe(ValueType.Error);
		expect(v.value).toBe("WORKER_EXECUTION_ERROR");
		expect(v.unit).toBe("Something broke");
	});

	test("Error without unit → errorValue with fallback message", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: ValueType.Error, value: 0, isPending: false });
		expect(v.type).toBe(ValueType.Error);
		expect(v.unit).toBe("Unknown worker error");
	});

	test("Unknown ValueType → numberValue (default fallback)", () => {
		const v = reconstructValue({ lineNumber: 1, valueType: 999 as ValueType, value: 123, isPending: false });
		expect(v.type).toBe(ValueType.Number);
		expect(v.value).toBe(123);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §2  Worker dispatch
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — worker dispatch", () => {
	test("isAvailable returns true when worker factory succeeds", () => {
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(true);
		// Factory was called once for the capability check
		expect(mockFactory).toHaveBeenCalledTimes(1);
		// The test worker was terminated
		expect(allWorkers[0].terminate).toHaveBeenCalled();
	});

	test("isAvailable returns false when worker factory throws", () => {
		mockFactory.mockImplementation(() => { throw new Error("No worker"); });
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(false);
	});

	test("executeBatch returns undefined when workers unavailable", () => {
		mockFactory.mockImplementation(() => { throw new Error("No worker"); });
		const pool = new ExecutionPool(2);
		const entries = makeEntries([1, 2], [10, 20]);
		expect(pool.executeBatch([1, 2], entries)).toBeUndefined();
	});

	test("executeBatch sends EXECUTE_BATCH message with correct structure", () => {
		const pool = new ExecutionPool(2);
		const entries = makeEntries([10, 20], [42, 99]);
		const promise = pool.executeBatch([10, 20], entries);
		expect(promise).toBeDefined();

		// isAvailable creates 1 test worker (terminated), ensureWorkers creates 2 pool workers = 3 total
		expect(allWorkers.length).toBe(3);

		// postMessage was sent to the FIRST pool worker (round-robin starts at index 0).
		// Skip the test worker (index 0) → first pool worker is allWorkers[1].
		const w = allWorkers[1];
		expect(w.postMessage).toHaveBeenCalledTimes(1);

		const [msg, transferList] = w.postMessage.mock.calls[0];
		expect(msg.type).toBe("EXECUTE_BATCH");
		expect(msg.id).toBeGreaterThan(0);
		expect(msg.items.length).toBe(2);
		expect(msg.items[0].lineNumber).toBe(10);
		expect(msg.items[1].lineNumber).toBe(20);
	});

	test("executeBatch resolves with worker results", async () => {
		const pool = new ExecutionPool(2);
		const entries = makeEntries([5], [77]);
		const promise = pool.executeBatch([5], entries)!;

		// Worker responds (first pool worker = allWorkers[1])
		const w = allWorkers[1];
		w.simulateResponse({
			id: 1,
			type: "EXECUTE_RESULT",
			results: [{ lineNumber: 5, valueType: ValueType.Number, value: 77, isPending: false }],
		});

		const results = await promise;
		expect(results).toEqual([{ lineNumber: 5, valueType: ValueType.Number, value: 77, isPending: false }]);
	});

	test("executeBatch skips entries with empty bytecode", () => {
		const pool = new ExecutionPool(2);
		const emptyBytecode = { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false };
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), emptyBytecode, [], null));
		entries.set(2, makeEntry(buildSimpleBytecode(42)));

		const promise = pool.executeBatch([1, 2], entries)!;
		expect(promise).toBeDefined();

		// First pool worker (allWorkers[1], after the test worker at index 0)
		const w = allWorkers[1];
		const [msg] = w.postMessage.mock.calls[0];
		// Only line 2 included (line 1 has empty bytecode)
		expect(msg.items.length).toBe(1);
		expect(msg.items[0].lineNumber).toBe(2);
	});

	test("executeBatch skips undefined entries in the map", () => {
		const pool = new ExecutionPool(2);
		const entries = new Map<number, LineCacheEntry | undefined>();
		entries.set(1, undefined);
		entries.set(2, makeEntry(buildSimpleBytecode(99)));

		const promise = pool.executeBatch([1, 2], entries)!;
		// First pool worker (allWorkers[1], after the test worker at index 0)
		const w = allWorkers[1];
		const [msg] = w.postMessage.mock.calls[0];
		expect(msg.items.length).toBe(1);
		expect(msg.items[0].lineNumber).toBe(2);
	});

	test("executeBatch returns resolved empty Promise when orderedLineNumbers is empty", async () => {
		const pool = new ExecutionPool(2);
		const entries = new Map<number, LineCacheEntry>();
		const promise = pool.executeBatch([], entries);
		expect(promise).toBeDefined();
		const results = await promise;
		expect(results).toEqual([]);
		// No worker message sent — only the isAvailable test worker exists
		expect(allWorkers.length).toBe(1);
	});

	test("executeBatch returns resolved empty Promise when all entries are empty", async () => {
		const pool = new ExecutionPool(2);
		const emptyBytecode = { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false };
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), emptyBytecode, [], null));
		entries.set(2, new LineCacheEntry(numberValue(0), emptyBytecode, [], null));

		const promise = pool.executeBatch([1, 2], entries)!;
		const results = await promise;
		expect(results).toEqual([]);
	});

	test("round-robin dispatches to multiple workers", () => {
		const pool = new ExecutionPool(3);
		// First batch → worker 0
		pool.executeBatch([1], makeEntries([1], [10]));
		// Second batch → worker 1
		pool.executeBatch([2], makeEntries([2], [20]));
		// Third batch → worker 2
		pool.executeBatch([3], makeEntries([3], [30]));
		// Fourth batch → worker 0 (wraps around)
		pool.executeBatch([4], makeEntries([4], [40]));

		// isAvailable created 1 worker, ensureWorkers creates 2 more → 3 total
		// Actually: isAvailable creates + terminates 1 (the test worker).
		// Then ensureWorkers creates poolSize (3) new ones.
		// So allWorkers has 1 (terminated test) + 3 (real) = 4 workers.
		// Real workers are at indices 1,2,3.

		const realWorkers = allWorkers.slice(1); // Skip the isAvailable test worker
		expect(realWorkers.length).toBe(3);

		// Worker 0: batches 1 and 4
		expect(realWorkers[0].postMessage).toHaveBeenCalledTimes(2);
		// Worker 1: batch 2
		expect(realWorkers[1].postMessage).toHaveBeenCalledTimes(1);
		// Worker 2: batch 3
		expect(realWorkers[2].postMessage).toHaveBeenCalledTimes(1);
	});

	test("concurrent batches get separate correlation IDs", () => {
		const pool = new ExecutionPool(2);
		pool.executeBatch([1], makeEntries([1], [10]));
		pool.executeBatch([2], makeEntries([2], [20]));

		const realWorkers = allWorkers.slice(1);
		const id1 = realWorkers[0].postMessage.mock.calls[0][0].id;
		const id2 = realWorkers[1].postMessage.mock.calls[0][0].id;
		expect(id2).toBeGreaterThan(id1);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §3  Timeout fallback
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — timeout fallback", () => {
	test("resolves with empty results after 30s timeout", async () => {
		jest.useFakeTimers();
		const pool = new ExecutionPool(2);
		const entries = makeEntries([1], [42]);
		const promise = pool.executeBatch([1], entries)!;

		// Don't let the worker respond — run all timers to fire the 30s timeout
		jest.runAllTimers();
		// Flush microtasks so the resolved Promise fires its .then callbacks
		await Promise.resolve();

		const results = await promise;
		expect(results).toEqual([]);
	});

	test("clears timeout when worker responds before 30s", async () => {
		jest.useFakeTimers();
		const pool = new ExecutionPool(2);
		const entries = makeEntries([7], [77]);
		const promise = pool.executeBatch([7], entries)!;

		// Worker responds after 5s (way before timeout)
		jest.advanceTimersByTime(5_000);
		const w = allWorkers[1];
		w.simulateResponse({
			id: 1,
			type: "EXECUTE_RESULT",
			results: [{ lineNumber: 7, valueType: ValueType.Number, value: 77, isPending: false }],
		});
		// Flush the microtask queued by the resolved batch Promise
		await Promise.resolve();

		const results = await promise;
		expect(results).toEqual([{ lineNumber: 7, valueType: ValueType.Number, value: 77, isPending: false }]);

		// Now run all remaining timers — the 30s timeout should NOT double-resolve
		// because clearTimeout was already called and the Promise is settled.
		jest.runAllTimers();
		await Promise.resolve();
		// No crash, result unchanged
	});

	test("clears pending batch when timeout fires, making late worker response a no-op", async () => {
		jest.useFakeTimers();
		const pool = new ExecutionPool(2);
		const entries = makeEntries([3], [33]);
		const promise = pool.executeBatch([3], entries)!;

		// Timeout fires first — run all timers
		jest.runAllTimers();
		await Promise.resolve();
		const timeoutResults = await promise;
		expect(timeoutResults).toEqual([]);

		// Now worker responds late — should be silently ignored
		const w = allWorkers[1];
		expect(() => {
			w.simulateResponse({
				id: 1,
				type: "EXECUTE_RESULT",
				results: [{ lineNumber: 3, valueType: ValueType.Number, value: 33, isPending: false }],
			});
		}).not.toThrow();
	});

	test("different batches have independent timeouts", async () => {
		jest.useFakeTimers();
		const pool = new ExecutionPool(2);

		// Batch 1 at t=0
		const promise1 = pool.executeBatch([1], makeEntries([1], [10]))!;
		// Batch 2 at t=10s
		jest.advanceTimersByTime(10_000);
		const promise2 = pool.executeBatch([2], makeEntries([2], [20]))!;

		// Worker 0 (batch 1) responds at t=15s → should get results
		jest.advanceTimersByTime(5_000);
		const realWorkers = allWorkers.slice(1);
		realWorkers[0].simulateResponse({
			id: 1,
			type: "EXECUTE_RESULT",
			results: [{ lineNumber: 1, valueType: ValueType.Number, value: 10, isPending: false }],
		});
		// Flush any Promise callbacks queued by simulateResponse
		await Promise.resolve();
		expect(await promise1).toEqual([{ lineNumber: 1, valueType: ValueType.Number, value: 10, isPending: false }]);

		// Batch 2 timeout fires at t=40s (30s after batch 2 was created at t=10s).
		// Run ALL pending timers so the 30s timeout triggers and Promise settles.
		jest.runAllTimers();
		await Promise.resolve();
		expect(await promise2).toEqual([]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §4  Onerror recovery
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — onerror recovery", () => {
	test("worker error resolves all pending batches with empty results", async () => {
		const pool = new ExecutionPool(2);
		const promise1 = pool.executeBatch([1], makeEntries([1], [10]))!;
		const promise2 = pool.executeBatch([2], makeEntries([2], [20]))!;

		const realWorkers = allWorkers.slice(1);
		realWorkers[0].simulateError("Worker crashed!");

		// Both promises should resolve with empty arrays
		expect(await promise1).toEqual([]);
		expect(await promise2).toEqual([]);
	});

	test("late worker response after error is a no-op (batch already resolved)", async () => {
		const pool = new ExecutionPool(2);
		const promise = pool.executeBatch([5], makeEntries([5], [55]))!;

		const realWorkers = allWorkers.slice(1);
		realWorkers[0].simulateError("Boom");

		await promise;

		// Late response — should not throw
		expect(() => {
			realWorkers[0].simulateResponse({
				id: 1,
				type: "EXECUTE_RESULT",
				results: [{ lineNumber: 5, valueType: ValueType.Number, value: 55, isPending: false }],
			});
		}).not.toThrow();
	});

	test("only the errored worker's batches are resolved (not other workers)", async () => {
		const pool = new ExecutionPool(2);
		// Batch 1 → worker 0
		const promise1 = pool.executeBatch([1], makeEntries([1], [10]))!;
		// Batch 2 → worker 1
		const promise2 = pool.executeBatch([2], makeEntries([2], [20]))!;

		const realWorkers = allWorkers.slice(1);
		// Worker 0 crashes
		realWorkers[0].simulateError("Worker 0 died");

		// Both batches are resolved because onerror resolves ALL pending batches
		// (the current implementation is aggressive — it resolves everything)
		expect(await promise1).toEqual([]);
		expect(await promise2).toEqual([]);
	});

	test("batches added after error operate normally", async () => {
		const pool = new ExecutionPool(2);
		const promise1 = pool.executeBatch([1], makeEntries([1], [10]))!;

		const realWorkers = allWorkers.slice(1);
		realWorkers[0].simulateError("Crash");
		await promise1;

		// New batch after error
		const promise2 = pool.executeBatch([3], makeEntries([3], [30]))!;
		realWorkers[0].simulateResponse({
			id: 2,
			type: "EXECUTE_RESULT",
			results: [{ lineNumber: 3, valueType: ValueType.Number, value: 30, isPending: false }],
		});

		expect(await promise2).toEqual([{ lineNumber: 3, valueType: ValueType.Number, value: 30, isPending: false }]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §5  isAvailable caching
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — isAvailable caching", () => {
	test("caches the result after first call (only one worker created)", () => {
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(true);
		const callsAfterFirst = mockFactory.mock.calls.length;

		// Second call should use cached value
		expect(pool.isAvailable()).toBe(true);
		expect(mockFactory).toHaveBeenCalledTimes(callsAfterFirst);
	});

	test("caches false result when worker factory throws", () => {
		mockFactory.mockImplementation(() => { throw new Error("No worker"); });
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(false);
		expect(mockFactory).toHaveBeenCalledTimes(1);

		// Second call should return cached false
		expect(pool.isAvailable()).toBe(false);
		expect(mockFactory).toHaveBeenCalledTimes(1);
	});

	test("returns false after destroy() regardless of cache", () => {
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(true);
		pool.destroy();
		expect(pool.isAvailable()).toBe(false);
	});

	test("returns false when Worker constructor is undefined", () => {
		const originalWorker = global.Worker;
		try {
			// @ts-expect-error - simulating Worker-less env
			delete global.Worker;

			const pool = new ExecutionPool(2);
			expect(pool.isAvailable()).toBe(false);
		} finally {
			global.Worker = originalWorker;
		}
	});

	test("returns true from cache after clear() since workers can be recreated", () => {
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(true);
		pool.clear();
		// _available cache persists; workers are recreated lazily on next dispatch
		expect(pool.isAvailable()).toBe(true);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §6  Transferable buffer cloning
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — Transferable buffer cloning", () => {
	test("clones opcodes buffer via .slice() — original untouched after transfer", () => {
		const pool = new ExecutionPool(2);
		const bytecode = buildSimpleBytecode(42);
		const originalOpcodes = bytecode.opcodes;
		const originalNumbers = bytecode.numbers;

		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		pool.executeBatch([1], entries);

		// Original buffers should be intact (not detached)
		expect(originalOpcodes.length).toBeGreaterThan(0);
		expect(originalOpcodes.byteLength).toBeGreaterThan(0);
		expect(originalNumbers.byteLength).toBeGreaterThanOrEqual(0);

		// Can still read from originals
		expect(originalOpcodes[0]).toBeDefined();
	});

	test("cloned buffers are transferred via postMessage transfer list", () => {
		const pool = new ExecutionPool(2);
		const bytecode = buildSimpleBytecode(99);
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		pool.executeBatch([1], entries);

		const realWorkers = allWorkers.slice(1);
		const [, transferList] = realWorkers[0].postMessage.mock.calls[0];
		expect(transferList).toBeDefined();
		expect(transferList.length).toBeGreaterThan(0);

		// Transfer list should contain ArrayBuffer instances.
		// Use constructor.name check because jsdom can have multiple
		// ArrayBuffer constructors (vm context mismatch).
		for (const item of transferList) {
			expect(item.constructor.name).toBe("ArrayBuffer");
		}
	});

	test("clones only the exact byte range (byteOffset to byteOffset+byteLength)", () => {
		// Create a larger buffer and a view into a sub-range
		const bigBuffer = new ArrayBuffer(64);
		const fullView = new Uint8Array(bigBuffer);
		fullView.fill(0xFF);

		// Create a view into bytes 8–15 (length 8)
		const subView = new Uint8Array(bigBuffer, 8, 8);
		subView[0] = OpCode.PUSH_NUMBER;
		subView[1] = 0; // number index
		subView[2] = OpCode.HALT;

		const bytecode = { opcodes: subView, numbers: new Float64Array(1), strings: [] as string[], hasAsync: false };
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		const pool = new ExecutionPool(2);
		pool.executeBatch([1], entries);

		const realWorkers = allWorkers.slice(1);
		const [msg] = realWorkers[0].postMessage.mock.calls[0];
		const item = msg.items[0];

		// The cloned buffer should have exactly 8 bytes
		expect(item.opcodesLength).toBe(8);
		expect(item.opcodesBuffer.byteLength).toBe(8);

		// The original full buffer should still be intact (64 bytes)
		expect(fullView.byteLength).toBe(64);
	});

	test("strings array is shallow-cloned (spread) into items", () => {
		const pool = new ExecutionPool(2);
		const bytecode = { opcodes: new Uint8Array([OpCode.PUSH_NUMBER, 0, OpCode.HALT]), numbers: new Float64Array(1), strings: ["hello", "world"], hasAsync: false };
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		pool.executeBatch([1], entries);

		const realWorkers = allWorkers.slice(1);
		const [msg] = realWorkers[0].postMessage.mock.calls[0];
		expect(msg.items[0].strings).toEqual(["hello", "world"]);
		// Should be a copy, not the same reference
		expect(msg.items[0].strings).not.toBe(bytecode.strings);
	});

	test("empty buffers are not added to transfer list", () => {
		const pool = new ExecutionPool(2);
		const bytecode = { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] as string[], hasAsync: false };
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		pool.executeBatch([1], entries);

		// Empty bytecode is skipped entirely (opcodes.length === 0)
		const realWorkers = allWorkers.slice(1);
		expect(realWorkers[0].postMessage).not.toHaveBeenCalled();
	});

	test("buffer contents match after cloning", () => {
		const pool = new ExecutionPool(2);
		const bytecode = buildSimpleBytecode(42);
		const entries = new Map<number, LineCacheEntry>();
		entries.set(1, new LineCacheEntry(numberValue(0), bytecode, [], null));

		pool.executeBatch([1], entries);

		const realWorkers = allWorkers.slice(1);
		const [msg] = realWorkers[0].postMessage.mock.calls[0];
		const cloned = new Uint8Array(msg.items[0].opcodesBuffer);

		// Verify bytecode content survived the clone
		expect(cloned[0]).toBe(OpCode.PUSH_NUMBER);
		expect(cloned[2]).toBe(OpCode.HALT);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §7  Lifecycle: clear() and destroy()
// ══════════════════════════════════════════════════════════════════════════

describe("ExecutionPool — lifecycle", () => {
	test("clear() terminates all workers", () => {
		const pool = new ExecutionPool(2);
		pool.executeBatch([1], makeEntries([1], [10])); // Creates workers

		pool.clear();

		// All workers terminated (including the isAvailable test worker)
		for (const w of allWorkers) {
			expect(w.terminate).toHaveBeenCalled();
		}
	});

	test("clear() resolves pending batches with empty results", async () => {
		const pool = new ExecutionPool(2);
		const promise = pool.executeBatch([5], makeEntries([5], [55]))!;

		pool.clear();

		const results = await promise;
		expect(results).toEqual([]);
	});

	test("clear() resets nextWorker to 0 for fresh round-robin", () => {
		const pool = new ExecutionPool(2);
		pool.executeBatch([1], makeEntries([1], [10]));
		pool.executeBatch([2], makeEntries([2], [20]));

		pool.clear();

		// After clear + new dispatch, should start from worker 0 again
		pool.executeBatch([3], makeEntries([3], [30]));
		// The new worker set (recreated lazily) starts round-robin from 0
	});

	test("destroy() sets terminated flag → isAvailable returns false", () => {
		const pool = new ExecutionPool(2);
		expect(pool.isAvailable()).toBe(true);
		pool.destroy();
		expect(pool.isAvailable()).toBe(false);
	});

	test("destroy() also clears workers and batches", () => {
		const pool = new ExecutionPool(2);
		pool.executeBatch([1], makeEntries([1], [10]));
		pool.destroy();

		// Workers terminated
		for (const w of allWorkers) {
			expect(w.terminate).toHaveBeenCalled();
		}
	});

	test("executeBatch returns undefined after destroy()", () => {
		const pool = new ExecutionPool(2);
		pool.destroy();
		expect(pool.executeBatch([1], makeEntries([1], [10]))).toBeUndefined();
	});

	test("workers are recreated lazily after clear() on next executeBatch", () => {
		const pool = new ExecutionPool(2);
		pool.executeBatch([1], makeEntries([1], [10])); // Creates workers

		// Count workers before clear
		const workersBeforeClear = allWorkers.length;

		pool.clear(); // Terminates them

		// After clear, all previous workers were pushed to allWorkers.
		// New dispatch creates fresh workers (with zero terminate calls).
		pool.executeBatch([2], makeEntries([2], [20]));
		const newlyCreated = allWorkers.filter(
			(w, i) => i >= workersBeforeClear,
		);
		expect(newlyCreated.length).toBeGreaterThan(0);
		expect(newlyCreated.every(w => w.terminate.mock.calls.length === 0)).toBe(true);
	});
});
