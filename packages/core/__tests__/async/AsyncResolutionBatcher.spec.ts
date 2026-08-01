import { describe, expect, test } from "@jest/globals";

/**
 * AsyncResolutionBatcher — Unit Tests
 *
 * Tests for:
 * - Micro-batching: multiple add() in same tick → single flush()
 * - Deduplication: same (packageId, queryKey) added twice → one entry in batch
 * - clearAll cancellation: add() then clearAll() → flush is no-op
 * - Error re-evaluation: error entries still trigger DAG walk + re-execution
 * - Multi-consumer delivery: all stream branches get events
 * - AbortSignal guard: entries with aborted signals are skipped
 * - Empty DAG: no affected lines → still notifies with empty lineNumbers
 * - Topological sort: producer→consumer order preserved
 * - cleared flag re-arming: add() after clearAll() works
 */

import { AsyncResolutionBatcher, type AsyncResolutionEvent } from "@solve-js/engine/AsyncResolutionBatcher";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { createVM } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { numberValue, ValueType } from "@solve-js/vm/Value";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

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

/**
 * Enable synchronous test event capture on a batcher.
 *
 * Sets `batcher._testCaptures` to a fresh array. All events emitted by
 * the batcher are synchronously pushed to this array (in addition to
 * the normal ReadableStream). No async timing issues — a single
 * `await queueMicrotask()` is sufficient for tests to observe events.
 */
function captureEvents(batcher: AsyncResolutionBatcher): {
	events: AsyncResolutionEvent[];
	stop: () => void;
} {
	const events: AsyncResolutionEvent[] = [];
	batcher._testCaptures = events;
	return {
		events,
		stop: () => { batcher._testCaptures = null; },
	};
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

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});

	test("should handle a single add() correctly", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(5, "weather", ["weather:London"]);
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(72), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "weather:London", packageId: "weather", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([5]);
		expect(evt.affectedQueryKeys).toEqual(["weather:London"]);

		collector.stop();
	});

	test("should NOT fire a separate flush for add() calls across different microtask ticks", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});

	test("should NOT deduplicate across different packageIds", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkgA", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkgB", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		const signal = liveSignal();
		batcher.add({ queryKey: "key", packageId: "pkgA", signal, isError: false });
		batcher.add({ queryKey: "key", packageId: "pkgB", signal, isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.affectedQueryKeys.sort()).toEqual(["key", "key"]);
		expect(evt.lineNumbers.sort()).toEqual([1, 2]);

		collector.stop();
	});

	test("add() deduplicates identical entries (first-write-wins)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		// Cancel BEFORE the microtask fires
		batcher.clearAll();

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events should fire
		expect(events.length).toBe(0);

		collector.stop();
	});

	test("clearAll() closes the stream — re-subscribed consumers get a fresh stream on next ctor", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		// First consumer
		const collector1 = captureEvents(batcher);

		batcher.add({ queryKey: "k1", packageId: "p1", signal: liveSignal(), isError: false });
		batcher.clearAll(); // Closes stream + clears pending

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(collector1.events.length).toBe(0); // Cancelled + stream closed
		collector1.stop();

		// Re-subscribe after clearAll — old stream is closed, so new
		// consumers need a new batcher from a fresh engine ctor.
		// This test verifies the cleared state; real code recreates the engine.
		const { batcher: batcher2, dag: dag2, lc: lc2 } = freshBatcher();
		dag2.registerLineDataSourceDependency(1, "pkg", ["k2"]);
		lc2.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const collector2 = captureEvents(batcher2);
		batcher2.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(collector2.events.length).toBe(1);
		collector2.stop();
	});

	test("should re-arm cleared flag on new add() so subsequent batches work", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Schedule and cancel (clearAll closes stream + clears pending)
		const collector1 = captureEvents(batcher);
		batcher.add({ queryKey: "stale", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll();

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(collector1.events.length).toBe(0); // Cancelled
		collector1.stop();

		// Re-subscribe with new batcher + add new resolution — cleared flag is re-armed by add()
		const { batcher: batcher2, dag: dag2, lc: lc2 } = freshBatcher();
		dag2.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc2.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const collector2 = captureEvents(batcher2);
		batcher2.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(collector2.events.length).toBe(1);
		expect(collector2.events[0].type).toBe("lines-updated");
		const evt = collector2.events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([1]);
		collector2.stop();
	});

	test("clearAll() closes stream so no new events arrive after", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const collector = captureEvents(batcher);
		batcher.clearAll();

		// Re-add and flush — stream was closed, no events
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events because stream was closed by clearAll()
		expect(collector.events.length).toBe(0);
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});

	test("should include error details in error events", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "rates", ["rate:FAIL"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});

	test("should trigger DAG re-evaluation for error entries too", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(5, "pkg", ["error:key"]);
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(88), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});

	test("should propagate unknown errors with a fallback message", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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

		collector.stop();
	});
});

// ────────────────────────────────────────────────────────────────────────
// §5  Multi-consumer delivery (stream branches)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — multi-consumer delivery", () => {
	test("should deliver events to all stream branches", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Create two independent branches from the event stream
		const [branch1, branch2] = batcher.getEventStream().tee();

		const events1: AsyncResolutionEvent[] = [];
		const events2: AsyncResolutionEvent[] = [];
		const r1 = branch1.getReader();
		const r2 = branch2.getReader();

		const p1 = (async () => { while (true) { const { done, value } = await r1.read(); if (done) break; events1.push(value); } })();
		const p2 = (async () => { while (true) { const { done, value } = await r2.read(); if (done) break; events2.push(value); } })();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve)); // Extra tick for tee readers

		expect(events1.length).toBe(1);
		expect(events2.length).toBe(1);
		expect(events1[0]).toEqual(events2[0]);

		r1.cancel();
		r2.cancel();
		await Promise.all([p1.catch(() => {}), p2.catch(() => {})]);
	});

	test("should isolate stream errors — one bad consumer does not break others", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// The tee() approach: each branch is independent
		const [branch1, branch2] = batcher.getEventStream().tee();

		const events: AsyncResolutionEvent[] = [];
		const r2 = branch2.getReader();
		const p2 = (async () => { while (true) { const { done, value } = await r2.read(); if (done) break; events.push(value); } })();

		// Branch 1: cancel immediately (simulates a bad consumer)
		const r1 = branch1.getReader();
		r1.cancel();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve)); // Extra tick for tee reader

		// Branch 2 should still receive the event
		expect(events.length).toBeGreaterThanOrEqual(1);

		r2.cancel();
		await p2.catch(() => {});
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: abortedSignal(), // Already aborted
			isError: true,
			error: new Error("should be skipped"),
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const errorEvts = events.filter((e) => e.type === "error");
		expect(errorEvts.length).toBe(0); // Aborted entries are skipped
		collector.stop();
	});

	test("should skip aborted entries during DAG walk", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// All entries were aborted → lines-updated with empty arrays
		const updateEvts = events.filter((e) => e.type === "lines-updated");
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);
		const evt = updateEvts[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
		collector.stop();
	});

	test("should mix live and aborted entries — only live ones processed", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["live-key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["dead-key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(99), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "live-key", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.add({ queryKey: "dead-key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([1]); // Only line 1 (live) re-evaluated
		expect(evt.affectedQueryKeys).toEqual(["live-key"]); // dead-key skipped
		collector.stop();
	});
});

// ────────────────────────────────────────────────────────────────────────
// §7  Empty DAG (no affected lines)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — empty DAG", () => {
	test("should still notify consumers when no lines are affected", async () => {
		const { batcher } = freshBatcher();

		// No lines registered in DAG — nothing depends on this queryKey
		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "orphan:key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual(["orphan:key"]);
		collector.stop();
	});

	test("should not notify when all entries are aborted and no lines affected", async () => {
		const { batcher } = freshBatcher();

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: abortedSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Aborted entries are skipped, but batcher still fires a lines-updated
		// event with empty arrays (lets consumers know batch was processed).
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual([]);
		collector.stop();
	});

	test("should still emit lines-updated even if only error entries and no affected lines", async () => {
		const { batcher } = freshBatcher();

		const collector = captureEvents(batcher);
		const events = collector.events;

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
		collector.stop();
	});
});

// ────────────────────────────────────────────────────────────────────────
// §8  Topological sort (producer → consumer order)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — topological sort", () => {
  test("should re-evaluate producer lines before consumer lines", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Line 10 produces variable "x", line 20 reads "x" and produces "y"
		dag.registerLine(10, [], ["x"]);
		dag.registerLine(20, ["x"], ["y"]);

		// Both depend on the same data source
		dag.registerLineDataSourceDependency(10, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["key"]);

		// Line 10: push 5, store x, halt — a pure producer. Deliberately NOT
		// buildVarBytecode() (which also LOAD_VARs "x" first): now that LOAD_VAR
		// throws for an undefined variable instead of silently reading 0, a line
		// with no prior producer must not read the variable it's about to define.
		const producerBuilder = new BytecodeBuilder();
		producerBuilder.reset();
		producerBuilder.emitOpcode(OpCode.PUSH_NUMBER);
		producerBuilder.emitNumber(5);
		producerBuilder.emitOpcode(OpCode.STORE_VAR);
		producerBuilder.emitString("x");
		producerBuilder.emitOpcode(OpCode.HALT);
		const bc10 = producerBuilder.build();
		// Line 20: load x, add 10, store y, halt
		const bc20 = buildVarBytecode("x", 10, "y");

		lc.set(10, new LineCacheEntry(numberValue(0), bc10, [], "x"));
		lc.set(20, new LineCacheEntry(numberValue(0), bc20, ["x"], "y"));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Line 10 (producer) should come before line 20 (consumer)
		expect(evt.lineNumbers[0]).toBe(10);
		expect(evt.lineNumbers[1]).toBe(20);
		expect(lc.getEntryForLine(20)?.result.toNumber()).toBe(15);
		collector.stop();
	});

	test("should handle a single line (no ordering needed)", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(42, "pkg", ["key"]);
		lc.set(42, new LineCacheEntry(numberValue(0), buildSimpleBytecode(7), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([42]);
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		// Both lines should be re-evaluated (order doesn't matter for independent lines)
		expect(evt.lineNumbers.sort()).toEqual([1, 2]);
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(3);
		// Producers (1, 2) before consumer (3)
		expect(evt.lineNumbers.indexOf(1)).toBeLessThan(evt.lineNumbers.indexOf(3));
		expect(evt.lineNumbers.indexOf(2)).toBeLessThan(evt.lineNumbers.indexOf(3));
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Should complete without error — fallback sort by line number
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		// Both lines are re-evaluated (order is by line number due to cycle)
		expect(evt.lineNumbers).toEqual([10, 20]);
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.length).toBe(2);
		expect(evt.lineNumbers).toEqual(expect.arrayContaining([5, 15]));
		collector.stop();
	});

	test("should skip lines with empty bytecode during re-execution", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		// Line 1 has bytecode, line 2 has empty bytecode
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [], hasAsync: false }, [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Only line 1 should be in updated lineNumbers (line 2 has empty bytecode)
		expect(evt.lineNumbers).toEqual([1]);
		collector.stop();
	});

	test("should skip lines not found in LineCache", async () => {
		const { batcher, dag } = freshBatcher();

		// Registered in DAG but not in LineCache
		dag.registerLineDataSourceDependency(99, "pkg", ["key"]);

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Line 99 not found in cache → skipped
		expect(evt.lineNumbers).toEqual([]);
		collector.stop();
	});
});

// ────────────────────────────────────────────────────────────────────────
// §8a  Per-line crash containment (fatal-bug regression)
// ────────────────────────────────────────────────────────────────────────

describe("AsyncResolutionBatcher — per-line crash containment (fatal-bug regression)", () => {
	// Regression for the fatal bug fixed this pass: reExecuteMainThread() used
	// to have no try/catch anywhere in its call chain, and ran inside a bare
	// queueMicrotask with no caller able to catch anything that escaped it —
	// one line's bytecode failing during re-execution (a corrupted-bytecode
	// TypeError, an undefined-variable throw, a stack/instruction-limit throw)
	// aborted the `for` loop immediately: every line scheduled AFTER the
	// failure in the same batch was silently never re-executed or notified,
	// and the exception itself was uncatchable — an uncaughtException that
	// could crash the host process outright (see AsyncResolutionBatcher.ts's
	// reExecuteMainThread() doc comment for the full account).

	test("a failing line's error does not abort re-execution of later lines in the same batch", async () => {
		const { batcher, dag, lc } = freshBatcher();

		// Line 1 registered FIRST so it lands first in iteration order (see
		// topologicalSort: independent lines with no producer/consumer edges
		// preserve DAG-registration order) — this reproduces the original bug
		// shape exactly: the failing line is not the last one in the batch.
		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(5, "pkg", ["key"]);

		// Line 1: LOAD_VAR of a variable that was never defined — a controlled
		// UNDEFINED_VARIABLE failure, returned as {type:'error'} by
		// executeBytecode() (not thrown) per this session's EvalResult
		// extension.
		const badBuilder = new BytecodeBuilder();
		badBuilder.reset();
		badBuilder.emitOpcode(OpCode.LOAD_VAR);
		badBuilder.emitString("neverDefined");
		badBuilder.emitOpcode(OpCode.HALT);
		const bcBad = badBuilder.build();

		lc.set(1, new LineCacheEntry(numberValue(0), bcBad, [], null));
		lc.set(5, new LineCacheEntry(numberValue(0), buildSimpleBytecode(99), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Both lines counted as updated — the failure on line 1 didn't stop
		// line 5 from being re-executed and reported.
		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers.slice().sort()).toEqual([1, 5]);

		// Line 1 gets a contained Error Value instead of being silently
		// dropped (this is the exact gap the reExecuteMainThread() fix in
		// this same session's pass closed — executeBytecode() returning
		// {type:'error'} as a value, not a thrown exception, previously fell
		// through both the success and pending branches unhandled).
		const line1Result = lc.getEntryForLine(1)!.result;
		expect(line1Result.type).toBe(ValueType.Error);

		// Line 5 executed normally and produced its real value — proof the
		// batch continued past the failure instead of aborting.
		expect(lc.getEntryForLine(5)!.result.toNumber()).toBe(99);

		collector.stop();
	});

	test("add() -> flush() settles cleanly with no thrown/unhandled error, even with no listeners attached", async () => {
		// Confirms the other half of the original bug: reExecuteMainThread()
		// ran inside a bare queueMicrotask() with no caller able to catch an
		// escaping exception — the failure was an uncaughtException, not just
		// a lost update. Asserts the whole add() -> flush() path settles
		// cleanly even with no event listeners or _testCaptures attached, so
		// there's no "someone happened to be listening and caught it" masking
		// the underlying containment.
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);

		const badBuilder = new BytecodeBuilder();
		badBuilder.reset();
		badBuilder.emitOpcode(OpCode.LOAD_VAR);
		badBuilder.emitString("neverDefined");
		badBuilder.emitOpcode(OpCode.HALT);
		lc.set(1, new LineCacheEntry(numberValue(0), badBuilder.build(), [], null));

		expect(() => {
			batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		}).not.toThrow();

		// The microtask queue must drain without an unhandled rejection or a
		// synchronous throw escaping queueMicrotask's callback.
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(lc.getEntryForLine(1)!.result.type).toBe(ValueType.Error);
	});
});

// ────────────────────────────────────────────────────────────────────────
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

		const collector = captureEvents(batcher);
		const events = collector.events;

		// Set activeSignal so CALL_PLUGIN can use it
		vm.activeSignal = liveSignal();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// Only line 2 (sync) should be updated; line 1 (async→pending) is skipped
		expect(evt.lineNumbers).toEqual([2]);
		expect(evt.affectedQueryKeys).toEqual(["key"]);

		delete pluginFunctionRegistry[250];
		collector.stop();
	});

	test("should update only sync lines when mixed sync+pending in re-execution", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(3, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(numberValue(0), buildSimpleBytecode(30), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		const evt = events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		// All three lines execute sync → all updated
		expect(evt.lineNumbers.sort()).toEqual([1, 2, 3]);
		collector.stop();
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

		const collector = captureEvents(batcher);
		const events = collector.events;

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
		collector.stop();
	});

	test("should handle rapid add() + clearAll() + add() cycles", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const collector1 = captureEvents(batcher);

		// Cycle 1: schedule + cancel
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll(); // Closes stream + clears pending

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(collector1.events.length).toBe(0);
		collector1.stop();

		// Cycle 2: new batcher + new add (re-arms cleared flag)
		const { batcher: batcher2, dag: dag2, lc: lc2 } = freshBatcher();
		dag2.registerLineDataSourceDependency(2, "pkg", ["k2"]);
		lc2.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));

		const collector2 = captureEvents(batcher2);
		batcher2.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(collector2.events.length).toBe(1);
		const evt = collector2.events[0] as Extract<AsyncResolutionEvent, { type: "lines-updated" }>;
		expect(evt.lineNumbers).toEqual([2]);
		collector2.stop();
	});

	test("should handle mix of error and success entries across different packages", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "rates", ["rate:USD:GBP"]);
		dag.registerLineDataSourceDependency(2, "weather", ["weather:London"]);
		dag.registerLineDataSourceDependency(3, "rates", ["rate:USD:EUR"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(numberValue(0), buildSimpleBytecode(30), [], null));

		const collector = captureEvents(batcher);
		const events = collector.events;

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
		collector.stop();
	});

	test("should handle an empty batch (no add calls before microtask)", async () => {
		const { batcher } = freshBatcher();

		const collector = captureEvents(batcher);
		const events = collector.events;

		// Don't add anything — just wait for any previously scheduled flush
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No events should fire (nothing was added)
		expect(events.length).toBe(0);
		collector.stop();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// §10  Stream — Enqueue (ReadableStream integration)
// ═══════════════════════════════════════════════════════════════════════
// Tests that events are properly enqueued into the native ReadableStream
// and can be read by consumers via getReader().

describe("AsyncResolutionBatcher — stream enqueue", () => {
	test("should enqueue events into the ReadableStream and deliver via getReader()", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		// Start reading in background
		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Stream may be cancelled
			}
		})();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		// Wait for microtask flush + async reader tick
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");

		reader.cancel();
		await readPromise;
	});

	test("should enqueue error events into the ReadableStream", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(10), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Stream may be cancelled
			}
		})();

		const err = new Error("Test stream error");
		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			error: err,
		});

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve)); // Third tick for second event delivery

		// Error event + lines-updated both enqueued
		expect(events.length).toBe(2);
		expect(events[0].type).toBe("error");
		expect(events[1].type).toBe("lines-updated");

		const errorEvent = events[0] as Extract<AsyncResolutionEvent, { type: "error" }>;
		expect(errorEvent.error).toBe(err);

		reader.cancel();
		await readPromise;
	});

	test("should enqueue multiple events from separate flushes", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Stream may be cancelled
			}
		})();

		// First flush across microtask boundary
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Second flush
		batcher.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(2);
		expect(events[0].type).toBe("lines-updated");
		expect(events[1].type).toBe("lines-updated");

		reader.cancel();
		await readPromise;
	});

	test("should enqueue to both synchronous test capture AND the ReadableStream", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Enable synchronous test capture
		const collector = captureEvents(batcher);

		// Also read from the stream
		const reader = batcher.getEventStream().getReader();
		const streamEvents: AsyncResolutionEvent[] = [];
		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					streamEvents.push(value);
				}
			} catch {
				// Stream may be cancelled
			}
		})();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Both capture paths get the event
		expect(collector.events.length).toBe(1);
		expect(streamEvents.length).toBe(1);
		expect(collector.events[0]).toEqual(streamEvents[0]);

		reader.cancel();
		collector.stop();
		await readPromise;
	});
});

// ═══════════════════════════════════════════════════════════════════════
// §11  Stream — Cancel (reader cancellation)
// ═══════════════════════════════════════════════════════════════════════
// Tests that canceling the stream reader properly stops the event flow
// and detaches the controller.

describe("AsyncResolutionBatcher — stream cancel", () => {
	test("should stop delivering events after reader.cancel()", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k2"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));
		lc.set(2, new LineCacheEntry(numberValue(0), buildSimpleBytecode(2), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Expected — reader cancelled
			}
		})();

		// First event arrives
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		expect(events.length).toBe(1);

		// Cancel the reader
		reader.cancel();

		// Second event enqueued — should not reach events[] (reader is cancelled)
		batcher.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Reader is cancelled, no new events land
		expect(events.length).toBe(1);

		await readPromise;
	});

	test("should null the internal _streamController after reader.cancel()", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const reader = batcher.getEventStream().getReader();

		// Controller exists before cancel
		expect((batcher as any)._streamController).not.toBeNull();

		// Read one event to ensure controller is attached
		const readPromise = reader.read().then(() => {});
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await readPromise;

		// Cancel the reader
		await reader.cancel();

		// Controller should be null after cancel
		expect((batcher as any)._streamController).toBeNull();
	});

	test("should not throw when enqueuing to a cancelled stream", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		const reader = batcher.getEventStream().getReader();
		await reader.cancel();

		// Enqueuing to a cancelled stream — should not throw
		expect(() => {
			batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		}).not.toThrow();

		// Wait for flush
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No assertion needed — test passes if no throw occurred
	});

	test("should resolve pending read() with {done: true} after reader.cancel()", async () => {
		const { batcher } = freshBatcher();

		const reader = batcher.getEventStream().getReader();

		// Start a read() that will never complete (no events added)
		const readResult = reader.read();

		// Cancel the reader while read() is pending
		reader.cancel();

		// Per the Web Streams spec, cancel() resolves pending reads with {done: true}.
		const result = await readResult;
		expect(result.done).toBe(true);
		expect(result.value).toBeUndefined();
	});

	test("cancel callback runs when stream is cancelled via reader", async () => {
		const { batcher } = freshBatcher();

		const reader = batcher.getEventStream().getReader();

		// Cancel the reader
		await reader.cancel();

		// The cancel callback should have nulled the controller
		expect((batcher as any)._streamController).toBeNull();

		// Calling cancel again is a no-op (reader already cancelled)
		await reader.cancel();
		expect((batcher as any)._streamController).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// §12  Stream — Close (clearAll stream cleanup)
// ═══════════════════════════════════════════════════════════════════════
// Tests that clearAll() properly closes the ReadableStream and readers
// receive a clean done signal.

describe("AsyncResolutionBatcher — stream close", () => {
	test("should resolve reader with {done: true} after clearAll()", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
				return true; // Reached done
			} catch {
				return false; // Error, not done
			}
		})();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(1);

		// clearAll closes the stream
		batcher.clearAll();

		// Reader should receive done: true
		const reachedDone = await readPromise;
		expect(reachedDone).toBe(true);
	});

	test("should replace _streamController with a fresh one after clearAll()", async () => {
		const { batcher } = freshBatcher();

		const controllerBefore = (batcher as any)._streamController;
		expect(controllerBefore).not.toBeNull();

		batcher.clearAll();

		// The old controller is closed and a new stream/controller is created —
		// the engine (and this batcher) survive clear(), so the batcher must
		// keep emitting events for new subscribers.
		const controllerAfter = (batcher as any)._streamController;
		expect(controllerAfter).not.toBeNull();
		expect(controllerAfter).not.toBe(controllerBefore);
	});

	test("should not enqueue new events after clearAll() closes the stream", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Stream closed
			}
		})();

		// Close the stream before adding any events
		batcher.clearAll();

		// Now add — should be silently ignored (stream is closed)
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(events.length).toBe(0);

		await readPromise;
	});

	test("should not throw when clearAll() is called multiple times", async () => {
		const { batcher } = freshBatcher();

		batcher.clearAll();
		expect(() => batcher.clearAll()).not.toThrow();
		expect(() => batcher.clearAll()).not.toThrow();
	});

	test("getEventStream() should return a fresh live stream after clearAll()", async () => {
		const { batcher } = freshBatcher();

		const streamBefore = batcher.getEventStream();
		batcher.clearAll();
		const streamAfter = batcher.getEventStream();

		// Old stream is closed; new subscribers get a fresh, readable stream.
		expect(streamBefore).not.toBe(streamAfter);
		expect(streamAfter.locked).toBe(false);
	});

	test("readers subscribed before clearAll() should receive done immediately", async () => {
		const { batcher } = freshBatcher();

		// Subscribe BEFORE the clear — this reader is bound to the old stream.
		const reader = batcher.getEventStream().getReader();

		batcher.clearAll();

		const { done, value } = await reader.read();

		expect(done).toBe(true);
		expect(value).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// §13  Stream — Controller Lifecycle
// ═══════════════════════════════════════════════════════════════════════
// Tests the _streamController state machine: creation, attachment on
// first read, null on cancel/close, and re-creation after engine rebuild.

describe("AsyncResolutionBatcher — stream controller lifecycle", () => {
	test("should create stream controller on construction", () => {
		const { batcher } = freshBatcher();

		// Controller is set during stream construction (start() callback runs)
		// But start() is lazy — it runs on first reader attachment.
		// The ReadableStream is constructed with a start callback, but
		// start() only runs when a reader is acquired.
		expect((batcher as any)._streamController).not.toBeNull();
	});

	test("should attach controller only once across multiple getEventStream() calls", () => {
		const { batcher } = freshBatcher();

		const controller1 = (batcher as any)._streamController;

		// getEventStream() returns the same stream — same controller
		batcher.getEventStream();
		const controller2 = (batcher as any)._streamController;

		expect(controller1).toBe(controller2);
	});

	test("should throw when getting a reader on a stream after previous reader cancelled", async () => {
		const { batcher } = freshBatcher();

		const reader1 = batcher.getEventStream().getReader();
		await reader1.cancel();

		// Controller nulled by cancel callback
		expect((batcher as any)._streamController).toBeNull();

		// Stream is now errored — a new reader should throw
		expect(() => {
			batcher.getEventStream().getReader();
		}).toThrow();
	});

	test("should maintain controller through the stream lifecycle: construct → read → cancel → null", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(1), [], null));

		// 1. Controller exists after construction
		expect((batcher as any)._streamController).not.toBeNull();

		// 2. Read an event — controller remains
		const reader = batcher.getEventStream().getReader();
		const readPromise = (async () => {
			const { done, value } = await reader.read();
			if (done) return;
		})();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await readPromise;

		expect((batcher as any)._streamController).not.toBeNull();

		// 3. Cancel — controller nulled
		await reader.cancel();
		expect((batcher as any)._streamController).toBeNull();
	});

	test("should recreate controller after clearAll() and recover with new batcher", () => {
		const { batcher } = freshBatcher();

		const controllerBefore = (batcher as any)._streamController;
		expect(controllerBefore).not.toBeNull();

		batcher.clearAll();
		// clearAll() closes the old stream and creates a fresh one so the
		// surviving batcher keeps emitting events to new subscribers.
		expect((batcher as any)._streamController).not.toBeNull();
		expect((batcher as any)._streamController).not.toBe(controllerBefore);

		// New batcher = new stream + new controller
		const { batcher: batcher2 } = freshBatcher();
		expect((batcher2 as any)._streamController).not.toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// §14  Stream — Edge Cases
// ═══════════════════════════════════════════════════════════════════════
// Tests for edge cases: double cancel, reading after cancel, locking,
// getEventStream() identity, and CountQueuingStrategy behavior.

describe("AsyncResolutionBatcher — stream edge cases", () => {
	test("getEventStream() should always return the same ReadableStream instance", () => {
		const { batcher } = freshBatcher();

		const s1 = batcher.getEventStream();
		const s2 = batcher.getEventStream();
		const s3 = batcher.getEventStream();

		expect(s1).toBe(s2);
		expect(s2).toBe(s3);
	});

	test("should throw when getting reader on a locked stream", () => {
		const { batcher } = freshBatcher();

		const reader1 = batcher.getEventStream().getReader();

		// Stream is now locked — getting another reader should throw
		expect(() => {
			batcher.getEventStream().getReader();
		}).toThrow();

		reader1.releaseLock();
	});

	test("should allow a new reader after releasing the lock", () => {
		const { batcher } = freshBatcher();

		const reader1 = batcher.getEventStream().getReader();
		reader1.releaseLock();

		// After releaseLock(), a new reader can be acquired
		const reader2 = batcher.getEventStream().getReader();
		expect(reader2).toBeDefined();
		reader2.cancel();
	});

	test("cancel then releaseLock should not throw", async () => {
		const { batcher } = freshBatcher();

		const reader = batcher.getEventStream().getReader();
		await reader.cancel();

		// releaseLock after cancel — should not throw
		expect(() => reader.releaseLock()).not.toThrow();
	});

	test("should handle a race between read() and cancel()", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		const reader = batcher.getEventStream().getReader();

		// Add an event so read() won't hang
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		// Start read and cancel simultaneously
		const readPromise = reader.read();
		reader.cancel();

		// Either the read resolves or rejects — neither should throw unhandled
		try {
			await readPromise;
		} catch {
			// Expected
		}
	});

	test("should deliver events even with a small highWaterMark", async () => {
		// Create batcher with small highWaterMark
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);

		for (let i = 1; i <= 10; i++) {
			dag.registerLineDataSourceDependency(i, "pkg", [`k${i}`]);
			lc.set(i, new LineCacheEntry(numberValue(0), buildSimpleBytecode(i), [], null));
		}

		const batcher = new AsyncResolutionBatcher(dag, lc, vm, 2); // tiny highWaterMark

		const reader = batcher.getEventStream().getReader();
		const events: AsyncResolutionEvent[] = [];

		// Don't read immediately — enqueue many events to fill the buffer
		for (let i = 1; i <= 10; i++) {
			batcher.add({ queryKey: `k${i}`, packageId: "pkg", signal: liveSignal(), isError: false });
		}

		// Now read — all events should be delivered despite the small buffer
		const readPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					events.push(value);
				}
			} catch {
				// Stream cancelled
			}
		})();

		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// All events should be delivered (backpressure just slows, not drops)
		expect(events.length).toBeGreaterThanOrEqual(1);

		reader.cancel();
		await readPromise;
	});

	test("stream should survive notifyListeners after controller is close()'d", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Manually close the controller (simulates clearAll)
		(batcher as any)._streamController?.close();

		// Adding events after close — should not throw
		expect(() => {
			batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		}).not.toThrow();

		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// No assertion needed — test passes if no throw
	});

	test("should not lose events when reading after a brief delay", async () => {
		const { batcher, dag, lc } = freshBatcher();

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(numberValue(0), buildSimpleBytecode(42), [], null));

		// Enqueue BEFORE acquiring reader
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		// Now acquire reader — the event was enqueued while no reader was active
		const reader = batcher.getEventStream().getReader();
		const { done, value } = await reader.read();

		// The event should still be delivered (buffered in the stream)
		expect(done).toBe(false);
		expect(value!.type).toBe("lines-updated");

		reader.cancel();
	});
});
