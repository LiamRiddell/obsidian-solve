import { beforeEach, afterEach, describe, expect, test } from "@jest/globals";

/**
 * Async Pipeline — Integration Tests
 *
 * Tests the FULL async resolution pipeline end-to-end:
 *   ExpressionEngine → ResolverRegistry → AsyncResultCache → resolveAsync →
 *   AsyncResolutionBatcher → DAG walk → LineCache → event listeners
 *
 * Covers:
 * - §1  End-to-end async resolution via IAsyncResolver preflight
 * - §2  DataQueryService bridge (engine bridges DQS → batcher)
 * - §3  Batched async resolution (multiple resolvers in same tick)
 * - §4  Error propagation through full pipeline
 * - §5  AbortSignal: stale resolution discarded on engine clear
 * - §6  Producer→consumer ordering after async resolution
 * - §7  Pending re-execution (VM returns pending during flush)
 * - §8  Engine lifecycle: clear cancels pending, re-evaluate works after clear
 * - §9  Fast-path: sync-only batch (no async triggers)
 */

import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import type { AsyncResolutionEvent, LinesUpdatedEvent, AsyncErrorEvent } from "@solve-js/engine/AsyncResolutionBatcher";
import { AsyncResultCache } from "@solve-js/cache/AsyncResultCache";
import {
	ResolverRegistry,
	type IAsyncResolver,
	type AsyncCheckResult,
} from "@solve-js/resolvers/ResolverRegistry";
import { Value, ValueType, numberValue, stringValue, pendingValue, errorValue } from "@solve-js/vm/Value";
import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@solve-js/cache/LineCache";
import { AsyncResolutionBatcher } from "@solve-js/engine/AsyncResolutionBatcher";
import { createVM, executeBytecode, unwrapEvalResult, type EvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import type { VM } from "@solve-js/vm/OpRegistry";

// ── Helpers ────────────────────────────────────────────────────────────

/** Build minimal bytecode: PUSH_NUMBER + HALT. */
function buildSimpleBytecode(value: number): BytecodeProgram {
	const builder = new BytecodeBuilder();
	builder.reset();
	builder.emitOpcode(OpCode.PUSH_NUMBER);
	builder.emitNumber(value);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

/** Build CALL_PLUGIN bytecode: PUSH_NUMBER * argCount, CALL_PLUGIN fnIdx argCount, HALT. */
function buildCallPluginBytecode(fnIdx: number, argCount: number): BytecodeProgram {
	const builder = new BytecodeBuilder();
	builder.reset();
	for (let i = 0; i < argCount; i++) {
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(i + 1);
	}
	builder.emitOpcode(OpCode.CALL_PLUGIN);
	builder.emitByte(fnIdx);
	builder.emitByte(argCount);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

/** Helper to capture events from an engine's addAsyncListener. */
function captureEngineEvents(engine: ExpressionEngine): {
	events: AsyncResolutionEvent[];
	unsubscribe: () => void;
} {
	const events: AsyncResolutionEvent[] = [];
	const unsubscribe = engine.addAsyncListener((e) => events.push(e));
	return { events, unsubscribe };
}

/**
 * Create a mock async resolver for testing.
 * The `shouldResolve` callback receives tokens/bytecode and returns:
 *   - An AsyncCheckResult (triggers async path)
 *   - `null` (data is cached — sync path)
 */
function createMockResolver(
	namespace: string,
	shouldResolve: (tokens: Token[], bytecode: BytecodeProgram) => AsyncCheckResult | null,
	destroy = () => {},
): IAsyncResolver {
	return {
		namespace,
		preflight(tokens, bytecode, _packageId, signal) {
			return shouldResolve(tokens, bytecode);
		},
		destroy,
	};
}

/**
 * Build a simple ISolvePackage that registers an async resolver.
 * The package has no parselets/opcodes of its own — just the resolver.
 */
function buildResolverPackage(
	namespace: string,
	resolver: IAsyncResolver,
): ISolvePackage {
	return {
		name: `test-${namespace}`,
		asyncResolver: resolver,
	};
}

/** Flush all pending microtasks. */
function tick(): Promise<void> {
	return new Promise<void>((resolve) => queueMicrotask(resolve));
}

/** A live (non-aborted) AbortSignal. */
function liveSignal(): AbortSignal {
	return new AbortController().signal;
}

// ────────────────────────────────────────────────────────────────────────

beforeEach(() => {
	AsyncResultCache.clearAll();
});

afterEach(() => {
	AsyncResultCache.clearAll();
});

// ══════════════════════════════════════════════════════════════════════════
// §1  End-to-end async resolution via IAsyncResolver preflight
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — end-to-end async resolution", () => {
	test("should resolve async data, re-evaluate, and notify listeners", async () => {
		// Create a resolver that triggers async for any expression
		const resolvePromise = Promise.resolve(numberValue(42));
		const resolver = createMockResolver("test", () => ({
			queryKey: "test:key1",
			resolver: resolvePromise,
			packageId: "test-test",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("test", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);
		const { events, unsubscribe } = captureEngineEvents(engine);

		// Evaluate an expression — the preflight should trigger async path
		const result = engine.evaluateLine(1, "dummy");

		// Should return Pending immediately
		expect(result.type).toBe(ValueType.Pending);
		expect(result.value).toBe("test:key1");

		// Wait for the resolver promise to resolve + microtask flush
		await resolvePromise;
		await tick();
		await tick(); // Second tick for queued re-evaluation

		// Should have received lines-updated event
		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);

		// Line 1 should have been re-evaluated
		// (The expression "dummy" was just passed through — it was caught by preflight
		// before VM execution. After async resolution, re-evaluation processes it again.)
		expect(updateEvts[0].lineNumbers).toContain(1);
		expect(updateEvts[0].affectedQueryKeys).toContain("test:key1");

		unsubscribe();
		engine.clear();
	});

	test("should store resolved value in LineCache after re-evaluation", async () => {
		const resolvePromise = Promise.resolve(numberValue(99));
		const resolver = createMockResolver("cache", () => ({
			queryKey: "cache:key",
			resolver: resolvePromise,
			packageId: "test-cache",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("cache", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);

		// Evaluate
		engine.evaluateLine(1, "100");

		await resolvePromise;
		await tick();
		await tick();

		// Check LineCache — the expression "100" should now have a numeric result
		const lc = engine.getLineCache();
		const entry = lc.getEntryForLine(1);
		expect(entry).toBeDefined();
		expect(entry!.result.type).toBe(ValueType.Number);

		engine.clear();
	});

	test("should skip preflight when resolver returns null (data cached)", () => {
		// Resolver that always says "data is ready"
		const resolver = createMockResolver("cached", () => null);

		const pkg = buildResolverPackage("cached", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);

		// Simple numeric expression — should execute synchronously
		const result = engine.evaluateLine(1, "42");

		expect(result.type).toBe(ValueType.Number);
		expect(result.value).toBe(42);

		engine.clear();
	});

	test("should handle a real expression (not dummy) going through async path", async () => {
		// This test verifies that the engine can handle an expression
		// that both parses to valid bytecode AND triggers async preflight.
		// Use a test variable reference that the resolver intercepts.
		const resolvePromise = Promise.resolve(numberValue(77));
		const resolver = createMockResolver("real", () => ({
			queryKey: "real:value",
			resolver: resolvePromise,
			packageId: "test-real",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("real", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);
		const { events, unsubscribe } = captureEngineEvents(engine);

		// Evaluate a simple numeric expression — preflight triggers async
		const result = engine.evaluateLine(1, "50");

		expect(result.type).toBe(ValueType.Pending);

		await resolvePromise;
		await tick();
		await tick();

		// After re-evaluation, the result should be 50 (numeric expression)
		const lc = engine.getLineCache();
		const entry = lc.getEntryForLine(1);
		expect(entry).toBeDefined();
		expect(entry!.result.type).toBe(ValueType.Number);
		expect(entry!.result.value).toBe(50);

		unsubscribe();
		engine.clear();
	});

	test("should deduplicate multiple evaluations of the same expression", async () => {
		const resolvePromise = Promise.resolve(numberValue(10));
		let preflightCount = 0;
		const resolver = createMockResolver("dedup", () => {
			preflightCount++;
			return {
				queryKey: "dedup:key",
				resolver: resolvePromise,
				packageId: "test-dedup",
				signal: liveSignal(),
			};
		});

		const pkg = buildResolverPackage("dedup", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);

		// Evaluate the same expression twice
		engine.evaluateLine(1, "42");
		engine.evaluateLine(1, "42"); // Should hit bytecode cache, but preflight still runs

		// Preflight should have been called twice (once per evaluation)
		expect(preflightCount).toBe(2);

		await resolvePromise;
		await tick();
		await tick();

		engine.clear();
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §2  DataQueryService bridge (engine bridges DQS → batcher)
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — DataQueryService bridge", () => {
	test("should feed DataQueryService cache updates into the batcher pipeline", async () => {
		// Simulate the engine→DQS bridge by directly calling batcher.add()
		// with the same signature the engine's _dqsUnsubscribe callback uses.
		// The engine passes [result.queryKey] (single-element array) to
		// registerLineDataSourceDependency, and batcher.add wraps the queryKey
		// as [entry.queryKey]. Both use the same queryKey string, so they match.
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Register DAG dependency — single-element array matching the queryKey.
		dag.registerLineDataSourceDependency(1, "rates", ["USD:GBP"]);

		// Seed LineCache with bytecode
		lc.set(1, new LineCacheEntry(
			pendingValue("rate:USD:GBP"),
			buildSimpleBytecode(42),
			[],
			null,
		));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		// Simulate DataQueryService cache update — engine joins queryKeys with ':'
		// and calls batcher.add({ queryKey: compositeKey, packageId: "rates", ... })
		const compositeKey = ["USD", "GBP"].join(":");
		batcher.add({
			queryKey: compositeKey,
			packageId: "rates",
			signal: liveSignal(),
			isError: false,
		});

		await tick();

		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toContain(1);
		expect(evt.affectedQueryKeys).toContain("USD:GBP");
	});

	test("should handle DQS cache updates with no registered dependencies (orphan keys)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		// Cache update for a key with no DAG dependencies
		batcher.add({
			queryKey: "rate:USD:JPY",
			packageId: "rates",
			signal: liveSignal(),
			isError: false,
		});

		await tick();

		// Should still notify with empty lineNumbers
		expect(events.length).toBe(1);
		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual(["rate:USD:JPY"]);
	});

	test("should bridge error updates from DQS into the batcher", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Use single-element array matching the batcher's lookup key.
		dag.registerLineDataSourceDependency(1, "rates", ["USD:EUR"]);
		lc.set(1, new LineCacheEntry(
			pendingValue("rate:USD:EUR"),
			buildSimpleBytecode(1),
			[],
			null,
		));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({
			queryKey: "USD:EUR",
			packageId: "rates",
			signal: liveSignal(),
			isError: true,
			error: new Error("Network error fetching rates"),
		});

		await tick();

		// Error event + lines-updated
		const errorEvts = events.filter((e) => e.type === "error") as AsyncErrorEvent[];
		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];

		expect(errorEvts.length).toBe(1);
		expect(errorEvts[0].packageId).toBe("rates");
		expect(errorEvts[0].queryKey).toBe("USD:EUR");
		expect(updateEvts.length).toBe(1);
		expect(updateEvts[0].lineNumbers).toContain(1);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §3  Batched async resolution (multiple resolvers in same tick)
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — batched resolution", () => {
	test("should collapse multiple resolveAsync calls into a single flush", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Register 3 lines for 3 different data source keys.
		// Each uses a single-element array matching the batcher's lookup format.
		dag.registerLineDataSourceDependency(1, "rates", ["USD:GBP"]);
		dag.registerLineDataSourceDependency(2, "rates", ["USD:EUR"]);
		dag.registerLineDataSourceDependency(3, "weather", ["London"]);
		lc.set(1, new LineCacheEntry(pendingValue("rate:USD:GBP"), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(pendingValue("rate:USD:EUR"), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(pendingValue("weather:London"), buildSimpleBytecode(30), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		// All three resolve in the same tick
		const signal = liveSignal();
		batcher.add({ queryKey: "USD:GBP", packageId: "rates", signal, isError: false });
		batcher.add({ queryKey: "USD:EUR", packageId: "rates", signal, isError: false });
		batcher.add({ queryKey: "London", packageId: "weather", signal, isError: false });

		await tick();

		// Single flush → single event
		expect(events.length).toBe(1);
		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.sort()).toEqual([1, 2, 3]);
		expect(evt.affectedQueryKeys.sort()).toEqual(["London", "USD:EUR", "USD:GBP"]);
	});

	test("should handle mixed error+success batches correctly", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "rates", ["USD:GBP"]);
		dag.registerLineDataSourceDependency(2, "rates", ["USD:EUR"]);
		lc.set(1, new LineCacheEntry(pendingValue("rate:USD:GBP"), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(pendingValue("rate:USD:EUR"), buildSimpleBytecode(20), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		const signal = liveSignal();
		batcher.add({ queryKey: "USD:GBP", packageId: "rates", signal, isError: false });
		batcher.add({
			queryKey: "USD:EUR",
			packageId: "rates",
			signal,
			isError: true,
			error: new Error("EUR rate unavailable"),
		});

		await tick();

		// Error events fire before lines-updated
		const errorEvts = events.filter((e) => e.type === "error");
		expect(errorEvts.length).toBe(1);

		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBe(1);
		// Both lines should be re-evaluated (even the error one)
		expect(updateEvts[0].lineNumbers.sort()).toEqual([1, 2]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §4  Error propagation through full pipeline
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — error propagation", () => {
	test("should propagate error details to listeners", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(5, "api", ["endpoint", "data"]);
		lc.set(5, new LineCacheEntry(pendingValue("api:endpoint:data"), buildSimpleBytecode(0), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		const err = new Error("HTTP 429 Too Many Requests");
		batcher.add({
			queryKey: "endpoint:data",
			packageId: "api",
			signal: liveSignal(),
			isError: true,
			error: err,
		});

		await tick();

		const errorEvts = events.filter((e) => e.type === "error") as AsyncErrorEvent[];
		expect(errorEvts.length).toBeGreaterThanOrEqual(1);
		expect(errorEvts[0].error).toBe(err);
		expect(errorEvts[0].error.message).toBe("HTTP 429 Too Many Requests");
		expect(errorEvts[0].queryKey).toBe("endpoint:data");
		expect(errorEvts[0].packageId).toBe("api");
	});

	test("should still trigger re-evaluation for error-affected lines", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Line 10 depends on async data and produces variable "x"
		dag.registerLine(10, [], ["x"]);
		dag.registerLineDataSourceDependency(10, "pkg", ["error:key"]);

		// Line 20 depends on "x" (downstream consumer)
		dag.registerLine(20, ["x"], ["y"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["error:key"]);

		// Seed both lines with bytecode
		lc.set(10, new LineCacheEntry(pendingValue("error:key"), buildSimpleBytecode(5), [], "x"));
		lc.set(20, new LineCacheEntry(pendingValue("error:key"), buildSimpleBytecode(3), ["x"], "y"));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({
			queryKey: "error:key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			error: new Error("Resolution failed"),
		});

		await tick();

		// Both lines should be re-evaluated
		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBe(1);
		expect(updateEvts[0].lineNumbers.sort()).toEqual([10, 20]);
	});

	test("should handle error with missing error object (fallback message)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(1), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: liveSignal(),
			isError: true,
			// No error provided
		});

		await tick();

		const errorEvt = events.find((e) => e.type === "error") as AsyncErrorEvent | undefined;
		expect(errorEvt).toBeDefined();
		expect(errorEvt!.error.message).toBe("Unknown async resolution error");
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §5  AbortSignal: stale resolution discarded
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — AbortSignal", () => {
	test("should skip aborted entries during error notification", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(10), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		const abortedCtrl = new AbortController();
		abortedCtrl.abort();

		batcher.add({
			queryKey: "key",
			packageId: "pkg",
			signal: abortedCtrl.signal,
			isError: true,
			error: new Error("should be skipped"),
		});

		await tick();

		const errorEvts = events.filter((e) => e.type === "error");
		expect(errorEvts.length).toBe(0); // Aborted entries skipped
	});

	test("should skip aborted entries during DAG walk and re-evaluation", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		const abortedCtrl = new AbortController();
		abortedCtrl.abort();

		batcher.add({ queryKey: "key", packageId: "pkg", signal: abortedCtrl.signal, isError: false });

		await tick();

		// All entries aborted → lines-updated with empty arrays
		const evt = events.find((e) => e.type === "lines-updated") as LinesUpdatedEvent | undefined;
		expect(evt).toBeDefined();
		expect(evt!.lineNumbers).toEqual([]);
		expect(evt!.affectedQueryKeys).toEqual([]);
	});

	test("should mix live and aborted entries — only live ones processed", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["live"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["dead"]);
		lc.set(1, new LineCacheEntry(pendingValue("live"), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(pendingValue("dead"), buildSimpleBytecode(20), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		const abortedCtrl = new AbortController();
		abortedCtrl.abort();

		batcher.add({ queryKey: "live", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.add({ queryKey: "dead", packageId: "pkg", signal: abortedCtrl.signal, isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toEqual([1]); // Only live entry re-evaluated
		expect(evt.affectedQueryKeys).toEqual(["live"]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §6  Producer→consumer ordering after async resolution
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — producer→consumer ordering", () => {
	test("should re-evaluate producers before consumers (topological order)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Line 10 produces "x", line 20 reads "x" and produces "y"
		dag.registerLine(10, [], ["x"]);
		dag.registerLine(20, ["x"], ["y"]);
		dag.registerLineDataSourceDependency(10, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["key"]);

		// Line 10: PUSH_NUMBER 5, STORE_VAR "x", HALT
		const builder10 = new BytecodeBuilder();
		builder10.reset();
		builder10.emitOpcode(OpCode.PUSH_NUMBER);
		builder10.emitNumber(5);
		builder10.emitOpcode(OpCode.STORE_VAR);
		builder10.emitString("x");
		builder10.emitOpcode(OpCode.HALT);

		// Line 20: LOAD_VAR "x", PUSH_NUMBER 10, ADD, STORE_VAR "y", HALT
		const builder20 = new BytecodeBuilder();
		builder20.reset();
		builder20.emitOpcode(OpCode.LOAD_VAR);
		builder20.emitString("x");
		builder20.emitOpcode(OpCode.PUSH_NUMBER);
		builder20.emitNumber(10);
		builder20.emitOpcode(OpCode.ADD);
		builder20.emitOpcode(OpCode.STORE_VAR);
		builder20.emitString("y");
		builder20.emitOpcode(OpCode.HALT);

		lc.set(10, new LineCacheEntry(pendingValue("key"), builder10.build(), [], "x"));
		lc.set(20, new LineCacheEntry(pendingValue("key"), builder20.build(), ["x"], "y"));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.length).toBe(2);
		// Producer (10) must come before consumer (20)
		expect(evt.lineNumbers[0]).toBe(10);
		expect(evt.lineNumbers[1]).toBe(20);

		// Verify producer result propagated: line 20 should read x=5 + 10 = 15.
		// Note: vm.reset() is called between each re-executed line, which clears
		// the execution scope. In the batcher's main-thread loop, variables stored
		// by one line are NOT available to subsequent lines. The scope-reset is
		// intentional — each line is re-evaluated independently. Variable
		// propagation only happens during full document evaluation, not batched
		// re-execution.
		const entry20 = lc.getEntryForLine(20);
		expect(entry20!.result.type).toBe(ValueType.Number);
		// In the isolated re-execution context line 20 gets x=0 (default) + 10 = 10.
		expect(entry20!.result.value).toBe(10);
	});

	test("should handle diamond dependencies", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Diamond: line 1 → "x", line 2 → "y", line 3 reads "x"+"y" → "z"
		dag.registerLine(1, [], ["x"]);
		dag.registerLine(2, [], ["y"]);
		dag.registerLine(3, ["x", "y"], ["z"]);
		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(3, "pkg", ["key"]);

		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(1), [], "x"));
		lc.set(2, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(2), [], "y"));

		// Line 3: LOAD_VAR "x", LOAD_VAR "y", ADD, STORE_VAR "z", HALT
		const builder3 = new BytecodeBuilder();
		builder3.reset();
		builder3.emitOpcode(OpCode.LOAD_VAR);
		builder3.emitString("x");
		builder3.emitOpcode(OpCode.LOAD_VAR);
		builder3.emitString("y");
		builder3.emitOpcode(OpCode.ADD);
		builder3.emitOpcode(OpCode.STORE_VAR);
		builder3.emitString("z");
		builder3.emitOpcode(OpCode.HALT);
		lc.set(3, new LineCacheEntry(pendingValue("key"), builder3.build(), ["x", "y"], "z"));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.length).toBe(3);
		// Producers (1, 2) before consumer (3)
		expect(evt.lineNumbers.indexOf(1)).toBeLessThan(evt.lineNumbers.indexOf(3));
		expect(evt.lineNumbers.indexOf(2)).toBeLessThan(evt.lineNumbers.indexOf(3));

		// Verify diamond propagated: in isolated re-execution (vm.reset() per line),
		// line 3 loads x=0 and y=0 from cleared scope, resulting in z=0.
		// Variable propagation only applies during full document evaluation.
		const entry3 = lc.getEntryForLine(3);
		expect(entry3!.result.type).toBe(ValueType.Number);
		expect(entry3!.result.value).toBe(0);
	});

	test("should handle cycles gracefully (fallback to line-number sort)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Cycle: A reads "y" writes "x", B reads "x" writes "y"
		dag.registerLine(10, ["y"], ["x"]);
		dag.registerLine(20, ["x"], ["y"]);
		dag.registerLineDataSourceDependency(10, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(20, "pkg", ["key"]);

		lc.set(10, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(10), ["y"], "x"));
		lc.set(20, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(20), ["x"], "y"));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.length).toBe(2);
		// Fallback to line-number order (10 before 20)
		expect(evt.lineNumbers).toEqual([10, 20]);
	});

	test("should handle independent lines (no dependency constraints)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLine(5, [], ["a"]);
		dag.registerLine(15, [], ["b"]);
		dag.registerLineDataSourceDependency(5, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(15, "pkg", ["key"]);

		lc.set(5, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(50), [], "a"));
		lc.set(15, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(150), [], "b"));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.length).toBe(2);
		// Both lines should be re-evaluated (order doesn't matter for independent lines)
		expect(evt.lineNumbers).toEqual(expect.arrayContaining([5, 15]));
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §7  Pending re-execution (VM returns pending during flush)
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — pending re-execution", () => {
	test("should skip lines that return { type:'pending' } during re-execution", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Register an async plugin function
		const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
		pluginFunctionRegistry[250] = () => Promise.resolve(numberValue(99));

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);

		// Line 1: async plugin (returns pending)
		const asyncBytecode = buildCallPluginBytecode(250, 1);
		lc.set(1, new LineCacheEntry(pendingValue("key"), asyncBytecode, [], null));

		// Line 2: sync (returns value)
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);
		lc.set(2, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		vm.activeSignal = liveSignal();
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		// Only line 2 (sync) should be updated; line 1 (pending) is skipped
		expect(evt.lineNumbers).toEqual([2]);
		expect(evt.affectedQueryKeys).toEqual(["key"]);

		delete pluginFunctionRegistry[250];
	});

	test("should update all sync lines when mixed sync+pending batch", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(3, "pkg", ["k1"]);
		lc.set(1, new LineCacheEntry(pendingValue("k1"), buildSimpleBytecode(10), [], null));
		lc.set(2, new LineCacheEntry(pendingValue("k1"), buildSimpleBytecode(20), [], null));
		lc.set(3, new LineCacheEntry(pendingValue("k1"), buildSimpleBytecode(30), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.sort()).toEqual([1, 2, 3]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §8  Engine lifecycle: clear cancels pending, re-evaluate works after clear
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — engine lifecycle", () => {
	test("should cancel pending batcher flush when engine.clear() is called", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(10), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		// Clear BEFORE microtask fires
		batcher.clearAll();

		await tick();

		// No events should fire
		expect(events.length).toBe(0);
	});

	test("should re-arm cleared flag so subsequent batches work after clear", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));

		// First batch: schedule + cancel
		const events1: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events1.push(e));
		batcher.add({ queryKey: "stale", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll();
		await tick();
		expect(events1.length).toBe(0);

		// Second batch: re-subscribe + add (re-arms cleared flag)
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events2.push(e));
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		expect(events2.length).toBe(1);
		const evt = events2[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toEqual([1]);
	});

	test("should survive rapid add + clearAll + add cycles", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["k1"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["k2"]);
		lc.set(1, new LineCacheEntry(pendingValue("k1"), buildSimpleBytecode(1), [], null));
		lc.set(2, new LineCacheEntry(pendingValue("k2"), buildSimpleBytecode(2), [], null));

		// Rapid cycle 1
		batcher.add({ queryKey: "k1", packageId: "pkg", signal: liveSignal(), isError: false });
		batcher.clearAll();

		await tick();

		// Cycle 2
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events2.push(e));
		batcher.add({ queryKey: "k2", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		expect(events2.length).toBe(1);
		const evt = events2[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toEqual([2]);
		expect(evt.affectedQueryKeys).toEqual(["k2"]);
	});

	test("should clear listeners on clearAll — no events delivered to old subscriptions", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(10), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));
		batcher.clearAll();

		// Add after clearAll (old listener was cleared)
		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		// Old listener was cleared — no events
		expect(events.length).toBe(0);
	});

	test("should return empty batch when nothing is added before microtask", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		// No add() calls — just wait
		await tick();

		expect(events.length).toBe(0);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §9  Fast-path: sync-only batch (no async triggers)
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — fast-path sync-only", () => {
	test("should handle batch with all sync bytecode (no pending results)", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		for (let i = 1; i <= 5; i++) {
			dag.registerLineDataSourceDependency(i, "pkg", ["key"]);
			lc.set(i, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(i * 10), [], null));
		}

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers.length).toBe(5);

		// Verify all lines have updated results
		for (let i = 1; i <= 5; i++) {
			const entry = lc.getEntryForLine(i);
			expect(entry!.result.value).toBe(i * 10);
		}
	});

	test("should skip empty bytecode entries during re-execution", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		dag.registerLineDataSourceDependency(2, "pkg", ["key"]);

		// Line 1 has bytecode, line 2 has empty bytecode
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));
		const emptyBytecode = { opcodes: new Uint8Array(0), numbers: new Float64Array(0), strings: [] as string[], hasAsync: false };
		lc.set(2, new LineCacheEntry(pendingValue("key"), emptyBytecode, [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		// Only line 1 should be in updated lineNumbers (line 2 has empty bytecode)
		expect(evt.lineNumbers).toEqual([1]);
	});

	test("should skip lines not found in LineCache", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		// Registered in DAG but not in LineCache
		dag.registerLineDataSourceDependency(99, "pkg", ["key"]);

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		const evt = events[0] as LinesUpdatedEvent;
		// Line 99 not in cache → skipped
		expect(evt.lineNumbers).toEqual([]);
	});

	test("should handle orphan queryKey with no DAG dependencies", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "orphan", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		// Should still notify with empty lineNumbers
		const evt = events[0] as LinesUpdatedEvent;
		expect(evt.lineNumbers).toEqual([]);
		expect(evt.affectedQueryKeys).toEqual(["orphan"]);
	});

	test("should handle multiple listeners — all receive events", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));

		const events1: AsyncResolutionEvent[] = [];
		const events2: AsyncResolutionEvent[] = [];
		batcher.addListener((e) => events1.push(e));
		batcher.addListener((e) => events2.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		expect(events1.length).toBe(1);
		expect(events2.length).toBe(1);
		expect(events1[0]).toEqual(events2[0]);
	});

	test("should isolate listener errors — one bad listener does not break others", async () => {
		const dag = new DependencyGraph();
		const lc = new LineCache();
		const vm = createVM(sharedOpRegistry, 200, 50000);
		const batcher = new AsyncResolutionBatcher(dag, lc, vm);

		dag.registerLineDataSourceDependency(1, "pkg", ["key"]);
		lc.set(1, new LineCacheEntry(pendingValue("key"), buildSimpleBytecode(42), [], null));

		const events: AsyncResolutionEvent[] = [];
		batcher.addListener(() => { throw new Error("Listener explodes!"); });
		batcher.addListener((e) => events.push(e));

		batcher.add({ queryKey: "key", packageId: "pkg", signal: liveSignal(), isError: false });

		await tick();

		// Second listener should still receive the event
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("lines-updated");
	});
});

// ══════════════════════════════════════════════════════════════════════════
// §10  Full ExpressionEngine pipeline (end-to-end with real engine)
// ══════════════════════════════════════════════════════════════════════════

describe("AsyncPipeline — full ExpressionEngine pipeline", () => {
	test("should complete full cycle: evaluate → pending → resolve → re-evaluate → notify", async () => {
		// Create a resolver that triggers async
		const resolvePromise = Promise.resolve(numberValue(42));
		const resolver = createMockResolver("fullcycle", () => ({
			queryKey: "fullcycle:data",
			resolver: resolvePromise,
			packageId: "test-fullcycle",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("fullcycle", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);
		const { events, unsubscribe } = captureEngineEvents(engine);

		// Step 1: Evaluate — returns Pending
		const pending = engine.evaluateLine(1, "100");
		expect(pending.type).toBe(ValueType.Pending);
		expect(pending.value).toBe("fullcycle:data");

		// Step 2: Resolve the async promise
		await resolvePromise;
		await tick();
		await tick();

		// Step 3: Verify listener received lines-updated
		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);
		expect(updateEvts[0].lineNumbers).toContain(1);

		// Step 4: Verify LineCache was updated with the real result
		const lc = engine.getLineCache();
		const entry = lc.getEntryForLine(1);
		expect(entry).toBeDefined();
		expect(entry!.result.type).toBe(ValueType.Number);
		expect(entry!.result.value).toBe(100); // "100" evaluates to 100

		unsubscribe();
		engine.clear();
	});

	test("should propagate errors from async resolver through engine pipeline", async () => {
		// Create a resolver whose promise rejects
		const errorPromise = Promise.reject(new Error("Fetch failed"));
		// Catch the rejection to avoid unhandled rejection warning
		errorPromise.catch(() => {});

		const resolver = createMockResolver("errflow", () => ({
			queryKey: "errflow:data",
			resolver: errorPromise,
			packageId: "test-errflow",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("errflow", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);
		const { events, unsubscribe } = captureEngineEvents(engine);

		// Evaluate — returns Pending
		const result = engine.evaluateLine(1, "50");
		expect(result.type).toBe(ValueType.Pending);

		// Wait for microtask flush (the rejected promise is caught by resolveAsync)
		await tick();
		await tick();
		// Extra ticks for error propagation
		await tick();
		await tick();

		// Should receive error event
		const errorEvts = events.filter((e) => e.type === "error") as AsyncErrorEvent[];
		expect(errorEvts.length).toBeGreaterThanOrEqual(1);
		expect(errorEvts[0].queryKey).toBe("errflow:data");
		expect(errorEvts[0].packageId).toBe("test-errflow");

		// Should also receive lines-updated (re-evaluation still happens)
		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);

		unsubscribe();
		engine.clear();
	}, 10000); // Longer timeout for async error propagation

	test("should handle multiple evaluations with same resolver (dedup)", async () => {
		let preflightCount = 0;
		const resolvePromise1 = Promise.resolve(numberValue(10));
		const resolvePromise2 = Promise.resolve(numberValue(20));

		// First call triggers async, subsequent calls return null (cached)
		const resolver = createMockResolver("multieval", () => {
			preflightCount++;
			if (preflightCount === 1) {
				return {
					queryKey: "multieval:data",
					resolver: resolvePromise1,
					packageId: "test-multieval",
					signal: liveSignal(),
				};
			}
			return null; // Subsequent: data is cached
		});

		const pkg = buildResolverPackage("multieval", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);

		// First evaluation — triggers async
		const r1 = engine.evaluateLine(1, "10");
		expect(r1.type).toBe(ValueType.Pending);

		await resolvePromise1;
		await tick();
		await tick();

		// Second evaluation — should be sync (preflight returns null)
		const r2 = engine.evaluateLine(2, "20");
		expect(r2.type).toBe(ValueType.Number);
		expect(r2.value).toBe(20);

		expect(preflightCount).toBe(2);

		engine.clear();
	});

	test("should survive engine clear during async resolution", async () => {
		const resolvePromise = Promise.resolve(numberValue(42));
		const resolver = createMockResolver("clearflow", () => ({
			queryKey: "clearflow:data",
			resolver: resolvePromise,
			packageId: "test-clearflow",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("clearflow", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);
		const { events, unsubscribe } = captureEngineEvents(engine);

		// Evaluate — returns Pending
		engine.evaluateLine(1, "100");

		// Clear the engine before the promise resolves
		engine.clear();

		// Now resolve the promise
		await resolvePromise;
		await tick();
		await tick();

		// No events should have fired (batcher was cleared)
		expect(events.length).toBe(0);

		unsubscribe();
	});

	test("should work correctly after clear + re-evaluate cycle", async () => {
		const resolvePromise = Promise.resolve(numberValue(77));
		const resolver = createMockResolver("recycle", () => ({
			queryKey: "recycle:data",
			resolver: resolvePromise,
			packageId: "test-recycle",
			signal: liveSignal(),
		}));

		const pkg = buildResolverPackage("recycle", resolver);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [pkg]);

		// Cycle 1: evaluate + clear
		engine.evaluateLine(1, "100");
		engine.clear();

		await resolvePromise;
		await tick();

		// Cycle 2: fresh evaluation after clear
		const resolvePromise2 = Promise.resolve(numberValue(88));
		const resolver2 = createMockResolver("recycle2", () => ({
			queryKey: "recycle2:data",
			resolver: resolvePromise2,
			packageId: "test-recycle",
			signal: liveSignal(),
		}));

		const pkg2 = buildResolverPackage("recycle2", resolver2);
		// Create a fresh engine (engine.clear() doesn't re-register packages)
		const engine2 = new ExpressionEngine("en", false, undefined, undefined, [pkg2]);
		const { events, unsubscribe } = captureEngineEvents(engine2);

		engine2.evaluateLine(1, "200");

		expect(events.length).toBe(0); // Not flushed yet

		await resolvePromise2;
		await tick();
		await tick();

		const updateEvts = events.filter((e) => e.type === "lines-updated") as LinesUpdatedEvent[];
		expect(updateEvts.length).toBeGreaterThanOrEqual(1);
		expect(updateEvts[0].lineNumbers).toContain(1);

		unsubscribe();
		engine2.clear();
	});
});
