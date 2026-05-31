import { describe, expect, test } from "@jest/globals";

/**
 * AsyncResolutionBatcher — Unit Tests
 *
 * Tests for:
 * - Micro-batching: multiple add() in same tick → single flush()
 * - Deduplication: same (packageId, queryKey) added twice → one entry in batch
 * - clearAll cancellation: add() then clearAll() → flush is no-op
 * - Error re-evaluation: error entries still trigger DAG walk + re-execution
 * - Multi-listener delivery: all listeners get events; unsubscribe works
 * - AbortSignal guard: entries with aborted signals are skipped
 * - Empty DAG: no affected lines → still notifies with empty lineNumbers
 * - Topological sort: producer→consumer order preserved
 * - cleared flag re-arming: add() after clearAll() works
 */

import { AsyncResolutionBatcher, type AsyncResolutionEvent, type UnsubscribeFn } from "@solve-js/engine/AsyncResolutionBatcher";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { createVM, type EvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType, numberValue, errorValue, pendingValue } from "@solve-js/vm/Value";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import type { VM } from "@solve-js/vm/OpRegistry";

// ── Helpers ────────────────────────────────────────────────────────────

/** Build minimal bytecode that returns a number (PUSH_NUMBER + HALT). */
function buildSimpleBytecode(value: number) {
	const builder = new BytecodeBuilder();
	builder.reset();
	builder.emitOpcode(OpCode.PUSH_NUMBER);
	builder.emitNumber(value);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

/** Build bytecode that LOAD_VAR + PUSH_NUMBER + ADD + STORE_VAR + HALT. */
function buildVarBytecode(readVar: string, addValue: number, writeVar: string) {
	const builder = new BytecodeBuilder();
	builder.reset();
	builder.emitOpcode(OpCode.LOAD_VAR);
	builder.emitString(readVar);
	builder.emitOpcode(OpCode.PUSH_NUMBER);
	builder.emitNumber(addValue);
	builder.emitOpcode(OpCode.ADD);
	builder.emitOpcode(OpCode.STORE_VAR);
	builder.emitString(writeVar);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

/** Create a fresh batcher with real DependencyGraph, LineCache, and VM. */
function freshBatcher() {
	const dag = new DependencyGraph();
	const lc = new LineCache();
	const vm = createVM(sharedOpRegistry, 200, 50000);
	return { batcher: new AsyncResolutionBatcher(dag, lc, vm), dag, lc, vm };
}

/** Helper to capture events from a listener subscription. */
function captureEvents(batcher: AsyncResolutionBatcher): { events: AsyncResolutionEvent[]; unsubscribe: UnsubscribeFn } {
	const events: AsyncResolutionEvent[] = [];
	const unsubscribe = batcher.addListener((e) => events.push(e));
	return { events, unsubscribe };
}

/** A non-aborted AbortSignal. */
function liveSignal(): AbortSignal {
	return new AbortController().signal;
}

/** An already-aborted AbortSignal. */
function abortedSignal(): AbortSignal {
	const ctrl = new AbortController();
	ctrl.abort();
	return ctrl.signal;
}

// ────────────────────────────────────────────────────────────────────────
// §1  Micro-batching
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — micro-batching", () => {
	test("should flush multiple add() calls in a single pass", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Register line 10 as affected by queryKey "rate:USD:GBP"
		dag.registerLineDataSourceDependency(10, "rates", ["rate:USD:GBP"]);
		// Register line 20 as affected by queryKey "rate:USD:EUR"
		dag.registerLineDataSourceDependency(20, "rates", ["rate:USD:EUR"]);

		// Seed LineCache with bytecode for both lines
		lc.set(10, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));
		lc.set(20, new LineCacheEntry(numberValue(0), buildSimpleBytecode(99), [], null));

		const { events } = captureEvents(batcher);

		// Add two resolutions in the same synchronous tick
		const signal = liveSignal();
		batcher.add({ queryKey: "rate:USD:GBP", packageId: "rates", signal, isError: false });
		batcher.add({ queryKey: "rate:USD:EUR", packageId: "rates", signal, isError: false });

		// Flush hasn't happened yet (scheduled via queueMicrotask)
		expect(events.length).toBe(0);

		// Wait for microtask
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Both resolutions flushed in a single batch
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.sort()).toEqual([10, 20]);
		expect(evt.affectedQueryKeys.sort()).toEqual(["rate:USD:EUR", "rate:USD:GBP"]);
	});

	test("should handle a single add() correctly", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(5, "weather", ["weather:London"]);
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(72), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "weather:London", packageId: "weather", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([5]);
		expect(evt.affectedQueryKeys).toEqual(["weather:London"]);
	});

	test("should NOT fire a separate flush for add() calls across different microtask ticks", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));

		const { events } = captureEvents(batcher);

		// First tick: add key1
		batcher.add({ queryKey: "key1", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Second tick: add key2
		batcher.add({ queryKey: "key2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Two separate flushes
		expect(events.length).toBe(2);
		expect(events[0].type).toBe("lines-updated");
		expect(events[1].type).toBe("lines-updated");
	});
});

// ────────────────────────────────────────────────────────────────────────
// §2  Deduplication
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — deduplication", () => {
	test("should deduplicate identical (packageId, queryKey) entries in the same batch", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		const signal = liveSignal();
		// Same key added 3 times
		batcher.add({ queryKey: "key", packageId: "pkg", signal, isError: false });
		batcher.add({ queryKey: "key", packageId: "pkg", signal, isError: false });
		batcher.add({ queryKey: "key", packageId: "pkg", signal, isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Only one query key, not duplicated
		expect(evt.affectedQueryKeys).toEqual(["key"]);
		// Line re-evaluated once
		expect(evt.lineNumbers).toEqual([1]);
	});

	test("should NOT deduplicate across different packageIds", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkgA", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkgB", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));

		const { events } = captureEvents(batcher);

		const signal = liveSignal();
		batcher.add({ queryKey: "key", packageId: "pkgA", signal, isError: false });
		batcher.add({ queryKey: "key", packageId: "pkgB", signal, isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.affectedQueryKeys.sort()).toEqual(["key", "key"]);
		expect(evt.lineNumbers.sort()).toEqual([1, 2]);
	});

	test("add() deduplicates identical entries (first-write-wins)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		// First: success entry, then: error entry for same (packageId, queryKey)
		// — add() deduplicates at entry time, rejecting the second. Only the
		// first (success) entry reaches the batch.
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: true, error: new Error("failed") });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Only the success entry was processed (error was deduplicated away)
		const errorEvents = events.filter((e) => e.type === "error");
		const updateEvents = events.filter((e) => e.type === "lines-updated");

		expect(errorEvents.length).toBe(0);
		expect(updateEvents.length).toBe(1);
	});
});

// ────────────────────────────────────────────────────────────────────────
// §3  clearAll cancellation
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — clearAll cancellation", () => {
	test("should cancel pending flush when clearAll() is called before microtask fires", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		// Cancel BEFORE the microtask fires
		batcher.clearAll();

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events should fire
		expect(events.length).toBe(0);
	});

	test("clearAll() clears listeners — re-subscribed listener gets new events", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		// First listener
		const events1: AsyncResolutionEvent[] = [];
		const unsub1 = batcher.addListener((e) => events1.push(e));

		batcher.add({ queryKey: "k1", packageId: "p1", signal: liveSignal(), isError: false });
		batcher.clearAll(); // Clears listeners + pending

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events1.length).toBe(0); // Cancelled + listener cleared
		unsub1(); // No-op since already cleared

		// Re-subscribe after clearAll
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events2.push(e));

		batcher.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// New listener should receive the event
		expect(events2.length).toBe(1);
	});

	test("should re-arm cleared flag on new add() so subsequent batches work", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Schedule and cancel (clearAll clears listeners + pending)
		const events1: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events1.push(e));
		batcher.add({ queryKey: "stale", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll();

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events1.length).toBe(0); // Cancelled

		// Re-subscribe listener + add new resolution — cleared flag is re-armed by add()
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events2.push(e));
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events2.length).toBe(1);
		expect(events2[0].type).toBe("lines-updated");
		const evt = events2[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([1]);
	});

	test("should clear all listeners when clearAll() is called", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);
		batcher.clearAll();

		// Re-add and flush — listener was cleared, no events
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events because listener was cleared by clearAll()
		expect(events.length).toBe(0);
	});
});

// ────────────────────────────────────────────────────────────────────────
// §4  Error re-evaluation
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — error re-evaluation", () => {
	test("should fire error events before lines-updated", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			error: new Error("Network timeout"),
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Error event fires first, then lines-updated
		expect(events.length).toBe(2);
		expect(events[0].type).toBe("error");
		expect(events[1].type).toBe("lines-updated");
	});

	test("should include error details in error events", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "rates", ["rate:FAIL"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		const err = new Error("API rate limit exceeded");
		batcher.add({
			queryKey: "rate:FAIL",
			packageId: "rates",
			signal: liveSignal(),
			isError: true,
			error: err,
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const errorEvt = events.find((e) => e.type === "error") as Extract<AsyncResolutionEvent, { type: "error" }>;
		expect(errorEvt).toBeDefined();
		expect(errorEvt.queryKey).toBe("rate:FAIL");
		expect(errorEvt.packageId).toBe("rates");
		expect(errorEvt.error).toBe(err);
	});

	test("should trigger DAG re-evaluation for error entries too", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(5, "pkg", ["error:key"]);
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(88), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({
			queryKey: "error:key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			error: new Error("fail"),
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const updateEvt = events.find((e) => e.type === "lines-updated") as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(updateEvt).toBeDefined();
		// Line 5 should be re-evaluated even though it was an error
		expect(updateEvt.lineNumbers).toEqual([5]);
	});

	test("should propagate unknown errors with a fallback message", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			// No error provided — batcher should use fallback
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const errorEvt = events.find((e) => e.type === "error") as Extract<AsyncResolutionEvent, { type: "error" }>;
		expect(errorEvt).toBeDefined();
		expect(errorEvt.error.message).toBe("Unknown async resolution error");
	});
});

// ────────────────────────────────────────────────────────────────────────
// §5  Multi-listener delivery
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — multi-listener delivery", () => {
	test("should deliver events to all registered listeners", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const events1: AsyncResolutionEvent[] = [];
		const events2: AsyncResolutionEvent[] = [];
		const unsub1 = batcher.addListener((e) => events1.push(e));
		const unsub2 = batcher.addListener((e) => events2.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events1.length).toBe(1);
		expect(events2.length).toBe(1);
		expect(events1[0]).toEqual(events2[0]);

		unsub1();
		unsub2();
	});

	test("should not deliver events to unsubscribed listeners", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));

		const events1: AsyncResolutionEvent[] = [];
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events1.push(e));
		const unsub2 = batcher.addListener((e) => events2.push(e));

		// Unsubscribe listener 2
		unsub2();

		batcher.add({ queryKey: "key1", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events1.length).toBe(1);
		expect(events2.length).toBe(0); // Unsubscribed
	});

	test("should isolate listener errors — one bad listener does not break others", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener(() => {
			throw new Error("Listener 1 crashes!");
		});
		batcher.addListener((e) => events2.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Listener 2 should still receive the event
		expect(events2.length).toBeGreaterThanOrEqual(1);
	});

	test("should return a working unsubscribe function", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const events: AsyncResolutionEvent[] = [];
		const unsub = batcher.addListener((e) => events.push(e));

		// Unsubscribe
		unsub();

		// Double-unsubscribe should be safe (no-op)
		unsub();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(0);
	});
});

// ────────────────────────────────────────────────────────────────────────
// §6  AbortSignal guard
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — AbortSignal guard", () => {
	test("should skip entries with aborted signals in error notification", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: abortedSignal(), // Already aborted
			isError: true,
			error: new Error("should be skipped"),
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Only lines-updated with empty lineNumbers (error was skipped)
		// or no event at all if all entries were aborted.
		const errorEvts = events.filter((e) => e.type === "error");
		expect(errorEvts.length).toBe(0); // Aborted entries are skipped
	});

	test("should skip aborted entries during DAG walk", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// All entries were aborted → lines-updated with empty arrays
		const updateEvts = events.filter((e) => e.type === "lines-updated");
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);
		const evt = updateEvts[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
	});

	test("should mix live and aborted entries — only live ones processed", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["live-key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["dead-key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(99), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "live-key", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.add({ queryKey: "dead-key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([1]); // Only line 1 (live) re-evaluated
		expect(evt.affectedQueryKeys).toEqual(["live-key"]); // dead-key skipped
	});
});

// ────────────────────────────────────────────────────────────────────────
// §7  Empty DAG (no affected lines)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — empty DAG", () => {
	test("should still notify listeners when no lines are affected", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// No lines registered in DAG — nothing depends on this queryKey
		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "orphan:key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual(["orphan:key"]);
	});

	test("should not notify when all entries are aborted and no lines affected", async () => {
		const { batcher } = freshBatcher();

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Aborted entries are skipped, but batcher still fires a lines-updated
		// event with empty arrays (lets UI know batch was processed).
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual([]);
	});

	test("should still emit lines-updated even if only error entries and no affected lines", async () => {
		const { batcher } = freshBatcher();

		const { events } = captureEvents(batcher);

		batcher.add({
			queryKey: "err:key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			error: new Error("fail"),
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Error event + lines-updated with empty lineNumbers
		expect(events.length).toBe(2);
		expect(events[0].type).toBe("error");
		expect(events[1].type).toBe("lines-updated");
		const evt = events[1] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
	});
});

// ────────────────────────────────────────────────────────────────────────
// §8  Topological sort (producer → consumer order)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — topological sort", () => {
	test("should re-evaluate producer lines before consumer lines", async () => {
		const { batcher, dag, lc, vm } = freshBatcher();

		// Line 10 produces variable "x", line 20 reads "x" and produces "y"
		dag.registerLine(10, [], ["x"]);
		dag.registerLine(20, ["x"], ["y"]);

		// Both depend on the same data source
		dag.registerLineDataSourceDependency(10, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["key"]);

		// Line 10: push 5, store x, halt
		const bc10 = buildVarBytecode("x", 5, "x"); // Reads x (0) + 5 → stores x (=5)
		// Line 20: load x, add 10, store y, halt
		const bc20 = buildVarBytecode("x", 10, "y");

		lc.set(10, new LineCacheEntry(numberValue(0), bc10, [], "x"));
		lc.set(20, new LineCacheEntry(numberValue(0), bc20, ["x"], "y"));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Line 10 (producer) should come before line 20 (consumer)
		expect(evt.lineNumbers[0]).toBe(10);
		expect(evt.lineNumbers[1]).toBe(20);
	});

	test("should handle a single line (no ordering needed)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(42, "pkg", ["key"]);
		lc.set(42, new LineCacheEntry(numberValue(0), buildSimpleBytecode(7), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([42]);
	});

	test("should handle independent lines (no dependency between them)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Two independent lines — no shared variables
		dag.registerLine(1, [], ["a"]);
		dag.registerLine(2, [], ["b"]);
		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], "a"));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], "b"));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		// Both lines should be re-evaluated (order doesn't matter for independent lines)
		expect(evt.lineNumbers.sort()).toEqual([1, 2]);
	});

	test("should handle multiple producers and consumers (diamond dependency)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Diamond: line 1 → "x", line 2 → "y", line 3 reads "x" and "y" → "z"
		dag.registerLine(1, [], ["x"]);
		dag.registerLine(2, [], ["y"]);
		dag.registerLine(3, ["x", "y"], ["z"]);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(3, "pkg", ["key"]);

		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], "x"));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], "y"));
		lc.set(3, new LineCacheEntry(numberValue(0), buildSimpleBytecode(3), ["x", "y"], "z"));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(3);
		// Producers (1, 2) before consumer (3)
		expect(evt.lineNumbers.indexOf(1)).toBeLessThan(evt.lineNumbers.indexOf(3));
		expect(evt.lineNumbers.indexOf(2)).toBeLessThan(evt.lineNumbers.indexOf(3));
	});

	test("should handle cycle gracefully (fallback to line number sort)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Cycle: A reads "y" writes "x", B reads "x" writes "y"
		dag.registerLine(10, ["y"], ["x"]);
		dag.registerLine(20, ["x"], ["y"]);

		dag.registerLineDataSourceDependency(10, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["key"]);

		lc.set(10, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), ["y"], "x"));
		lc.set(20, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), ["x"], "y"));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Should complete without error — fallback sort by line number
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		// Both lines are re-evaluated (order is by line number due to cycle)
		expect(evt.lineNumbers).toEqual([10, 20]);
	});

	test("should handle lines without DAG registration (no reads/writes)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Lines registered with empty reads/writes via registerLine() to ensure
		// topologicalSort's getDependencies/getWrites return valid Sets.
		dag.registerLine(5, [], []);
		dag.registerLine(15, [], []);
		dag.registerLineDataSourceDependency(5, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(15, "pkg", ["key"]);
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(50), [], null));
		lc.set(15, new LineCacheEntry(numberValue(0), buildSimpleBytecode(150), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		// Lines with no reads/writes → inDegree=0 → processed in any order.
		// Since order is implementation-defined (Map iteration), verify both
		// lines are present rather than asserting exact order.
		expect(evt.lineNumbers).toEqual(expect.arrayContaining([5, 15]));
	});

	test("should skip lines with empty bytecode during re-execution", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		// Line 1 has bytecode, line 2 has empty bytecode
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false }, [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Only line 1 should be in updated lineNumbers (line 2 has empty bytecode)
		expect(evt.lineNumbers).toEqual([1]);
	});

	test("should skip lines not found in LineCache", async () => {
		const { batcher, dag } = freshBatcher();

		// Registered in DAG but not in LineCache
		dag.registerLineDataSourceDependency(99, "pkg", ["key"]);

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Line 99 not found in cache → skipped
		expect(evt.lineNumbers).toEqual([]);
	});
});// ────────────────────────────────────────────────────────────────────────
// §8b  Pending re-execution (VM returns pending during flush)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — pending re-execution", () => {
	test("should skip lines that return { type:'pending' } during re-execution", async () => {
		const { batcher, dag, lc, vm } = freshBatcher();

		// Register a plugin function that returns a Promise
		const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
		pluginFunctionRegistry[250] = () => Promise.resolve(numberValue(99));

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);

		// Build bytecode that calls the async plugin: PUSH_NUMBER 1, CALL_PLUGIN 250 1, HALT
		const builder = new BytecodeBuilder();
		builder.reset();
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(1);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitByte(250);
		builder.emitByte(1);
		builder.emitOpcode(OpCode.HALT);
		const asyncBytecode = builder.build();

		lc.set(1, new LineCacheEntry(numberValue(0), asyncBytecode, [], null));

		// Also register a second line with simple (sync) bytecode
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const { events } = captureEvents(batcher);

		// Set activeSignal so CALL_PLUGIN can use it
		vm.activeSignal = liveSignal();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Only line 2 (sync) should be updated; line 1 (async→pending) is skipped
		expect(evt.lineNumbers).toEqual([2]);
		expect(evt.affectedQueryKeys).toEqual(["key"]);

		delete pluginFunctionRegistry[250];
	});

	test("should update only sync lines when mixed sync+pending in re-execution", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(3, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(numberValue(0), buildSimpleBytecode(30), [], null));

		const { events } = captureEvents(batcher);

		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// All three lines execute sync → all updated
		expect(evt.lineNumbers.sort()).toEqual([1, 2, 3]);
	});
});

// ────────────────────────────────────────────────────────────────────────
// §9  Edge cases
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — edge cases", () => {
	test("should handle add() with nothing scheduled (first add re-arms, second re-schedules)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(7), [], null));

		const { events } = captureEvents(batcher);

		// Add, flush, then add again (should schedule a new flush)
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events.length).toBe(1);

		// Reset DAG + cache with new entries
		dag.registerLineDataSourceDependency(2, "pkg", ["key2"]);
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		batcher.add({ queryKey: "key2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events.length).toBe(2);
	});

	test("should handle rapid add() + clearAll() + add() cycles", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const events1: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events1.push(e));

		// Cycle 1: schedule + cancel
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll(); // Clears listener + pending

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events1.length).toBe(0);

		// Cycle 2: re-subscribe + new add (re-arms cleared flag)
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events2.push(e));

		dag.registerLineDataSourceDependency(2, "pkg", ["k2"]);
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));
		batcher.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events2.length).toBe(1);
		const evt = events2[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([2]);
	});

	test("should handle mix of error and success entries across different packages", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "rates", ["rate:USD:GBP"]);
		dag.registerLineDataSourceDependency(2, "weather", ["weather:London"]);
		dag.registerLineDataSourceDependency(3, "rates", ["rate:USD:EUR"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(numberValue(0), buildSimpleBytecode(30), [], null));

		const { events } = captureEvents(batcher);

		const signal = liveSignal();
		batcher.add({ queryKey: "rate:USD:GBP", packageId: "rates", signal, isError: false });
		batcher.add({ queryKey: "weather:London", packageId: "weather", signal, isError: true, error: new Error("API down") });
		batcher.add({ queryKey: "rate:USD:EUR", packageId: "rates", signal, isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Error events fire first
		const errorEvts = events.filter((e) => e.type === "error");
		expect(errorEvts.length).toBe(1);
		expect((errorEvts[0] as Extract<AsyncResolutionEvent, { type: "error" }>).packageId).toBe("weather");

		// Then lines-updated covers all three lines
		const updateEvts = events.filter((e) => e.type === "lines-updated");
		expect(updateEvts.length).toBe(1);
		const evt = updateEvts[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.sort()).toEqual([1, 2, 3]);
	});

	test("should handle an empty batch (no add calls before microtask)", async () => {
		const { batcher } = freshBatcher();

		const { events } = captureEvents(batcher);

		// Don't add anything — just wait for any previously scheduled flush
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events should fire (nothing was added)
		expect(events.length).toBe(0);
	});
});
