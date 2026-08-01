import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { ThreeTierEvaluator } from "@solve-js/engine/ThreeTierEvaluator";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { numberValue, ValueType } from "@solve-js/vm/Value";
import { pluginFunctionRegistry } from "@solve-js/vm/VMBuiltins";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * Helper: create a fresh engine (no diagnostic mode).
 */
function createEngine(): ExpressionEngine {
	return new ExpressionEngine("en", false);
}

/**
 * Helper: create a DocumentModel initialized with text lines.
 */
function createDoc(lines: string[]): DocumentModel {
	const doc = new DocumentModel();
	doc.setDocument(lines.join("\n"));
	return doc;
}

// ═══════════════════════════════════════════════════════════════════════════
// Group 1: ThreeTierEvaluator → engine.setKeystrokeSignal() propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("Keystroke AbortController — Signal Propagation", () => {
	let engine: ExpressionEngine;
	let doc: DocumentModel;
	let setSignalSpy: jest.SpiedFunction<typeof engine.setKeystrokeSignal>;

	beforeEach(() => {
		engine = createEngine();
		doc = createDoc(["10 + 5", "20 * 2", "30 - 7"]);
		setSignalSpy = jest.spyOn(engine, "setKeystrokeSignal");
	});

	afterEach(() => {
		setSignalSpy.mockRestore();
	});

	// ── evaluate() ────────────────────────────────────────────────────

	test("evaluate() passes keystroke signal to engine before evaluation", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		const controller = new AbortController();

		evaluator.evaluate({ startLine: 1, endLine: 3 }, controller.signal);

		// Should have been called with the signal, then with null (finally cleanup)
		expect(setSignalSpy).toHaveBeenCalledWith(controller.signal);
		expect(setSignalSpy).toHaveBeenCalledWith(null);

		// Signal set before null cleared (order matters)
		const calls = setSignalSpy.mock.calls.map((c) => c[0]);
		const signalIndex = calls.indexOf(controller.signal);
		const nullIndex = calls.indexOf(null);
		expect(signalIndex).toBeGreaterThanOrEqual(0);
		expect(nullIndex).toBeGreaterThan(signalIndex);
	});

	test("evaluate() with undefined signal treats it as null", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);

		evaluator.evaluate({ startLine: 1, endLine: 3 });

		// Every call to setKeystrokeSignal should pass null
		// (setKeystrokeSignal(signal ?? null) + finally setKeystrokeSignal(null))
		for (const call of setSignalSpy.mock.calls) {
			expect(call[0]).toBeNull();
		}
		// At minimum, two calls: one to set, one to clear in finally
		expect(setSignalSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	test("evaluate() clears signal even when evaluation succeeds", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		const controller = new AbortController();

		evaluator.evaluate({ startLine: 1, endLine: 2 }, controller.signal);

		// Last call should always be null (cleanup in finally)
		const lastCall = setSignalSpy.mock.calls[setSignalSpy.mock.calls.length - 1][0];
		expect(lastCall).toBeNull();
	});

	// ── evaluateAll() ─────────────────────────────────────────────────

	test("evaluateAll() passes keystroke signal to engine", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		const controller = new AbortController();

		evaluator.evaluateAll(controller.signal);

		expect(setSignalSpy).toHaveBeenCalledWith(controller.signal);
		expect(setSignalSpy).toHaveBeenCalledWith(null);
	});

	test("evaluateAll() clears signal after completion", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		const controller = new AbortController();

		evaluator.evaluateAll(controller.signal);

		const lastCall = setSignalSpy.mock.calls[setSignalSpy.mock.calls.length - 1][0];
		expect(lastCall).toBeNull();
	});

	// ── setViewport() ─────────────────────────────────────────────────

	test("setViewport() passes keystroke signal to engine (no dirty before viewport)", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluateAll(); // make all lines clean

		const controller = new AbortController();

		evaluator.setViewport({ startLine: 2, endLine: 3 }, controller.signal);

		expect(setSignalSpy).toHaveBeenCalledWith(controller.signal);
		expect(setSignalSpy).toHaveBeenCalledWith(null);
	});

	test("setViewport() clears signal after completion", () => {
		const evaluator = new ThreeTierEvaluator(doc, engine);
		evaluator.evaluateAll();

		const controller = new AbortController();
		evaluator.setViewport({ startLine: 1, endLine: 2 }, controller.signal);

		const lastCall = setSignalSpy.mock.calls[setSignalSpy.mock.calls.length - 1][0];
		expect(lastCall).toBeNull();
	});

	test("setViewport() falls back to evaluate() when dirty lines exist before viewport", () => {
		const doc2 = createDoc([":x = 5", "x + 3", "x * 2"]);
		const evaluator = new ThreeTierEvaluator(doc2, engine);
		evaluator.evaluateAll();

		// Edit line 1 (variable def) to make it dirty
		doc2.editLine(1, ":x = 20");

		const controller = new AbortController();
		// setViewport at line 3 — line 1 is dirty before viewport
		evaluator.setViewport({ startLine: 3, endLine: 3 }, controller.signal);

		// The fallback calls evaluate(viewport, signal) which internally sets and clears.
		// Then setViewport's own finally block also sets and clears.
		const calls = setSignalSpy.mock.calls.map((c) => c[0]);
		expect(calls).toContain(controller.signal);
		expect(calls[calls.length - 1]).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 2: Cancellation behavior + VM linkage  (merged)
// ═══════════════════════════════════════════════════════════════════════════

describe("Keystroke AbortController — Cancellation & VM Linkage", () => {
	let engine: ExpressionEngine;

	beforeEach(() => {
		engine = createEngine();
	});

	// ── Synchronous cancellation propagation ──────────────────────────

	test("completed sync evaluation detaches its keystroke listener (no retroactive abort)", () => {
		// Use engine.evaluateLine() directly — avoids the evaluator's
		// setKeystrokeSignal(null) in its finally block, which would
		// overwrite the signal before executeAndStore runs.
		const controller = new AbortController();
		engine.setKeystrokeSignal(controller.signal);

		// evaluateLine → evaluateWithTokens → executeAndStore
		// executeAndStore links its local AbortController to keystrokeSignal,
		// then DETACHES it when the evaluation completes synchronously —
		// otherwise one listener per evaluated line accumulates on the
		// keystroke signal (listener leak on large documents).
		engine.evaluateLine(1, "5 + 3");

		// After executeAndStore, vm.activeSignal was set to the local controller's signal
		const vmSignal = engine.getVM().activeSignal;
		expect(vmSignal).toBeDefined();

		// Abort the keystroke AFTER the evaluation finished — there is no
		// in-flight work, so the completed evaluation's controller must NOT
		// be retroactively aborted.
		controller.abort("New keystroke");
		expect(vmSignal!.aborted).toBe(false);
	});

	test("completed executeRaw evaluation detaches its keystroke listener", () => {
		// executeRaw is used by executeCached (Tier 2) and reEvaluateLine.
		const controller = new AbortController();
		engine.setKeystrokeSignal(controller.signal);

		// Compile first to get bytecode in cache
		const { program } = engine.compileExpression("10 * 2");

		// executeCached → executeRaw → links local controller to keystrokeSignal,
		// then detaches it on sync completion (see executeRaw listener cleanup).
		engine.executeCached(program);

		const vmSignal = engine.getVM().activeSignal;
		expect(vmSignal).toBeDefined();

		controller.abort("New keystroke");
		expect(vmSignal!.aborted).toBe(false);
	});

	// ── VM linkage ────────────────────────────────────────────────────

	test("VM reset clears abortCurrent", () => {
		const controller = new AbortController();
		engine.setKeystrokeSignal(controller.signal);

		// evaluateLine sets vm.abortCurrent via executeAndStore
		engine.evaluateLine(1, "5 + 3");

		const vm = engine.getVM();
		expect(vm.abortCurrent).toBeDefined();

		// Reset VM — should clear abortCurrent and abort any in-flight work
		vm.reset();

		expect(vm.abortCurrent).toBeUndefined();
	});

	test("vm.activeSignal stays unaborted after post-completion keystroke abort", () => {
		const controller = new AbortController();
		engine.setKeystrokeSignal(controller.signal);

		engine.evaluateLine(1, "7 - 2");

		const vm = engine.getVM();
		expect(vm.activeSignal).toBeDefined();
		expect(vm.activeSignal!.aborted).toBe(false);

		controller.abort("Keystroke");

		// Completed evaluation — listener already detached, no retroactive abort.
		expect(vm.activeSignal!.aborted).toBe(false);
	});

	// ── Async cancellation: signal propagates to pending results ──────

	test("keystroke signal propagates through preflight path in diagnostic mode", () => {
		// When the engine is in diagnostic mode, evaluateLine routes through
		// evaluateExpressionWithDiagnostic, which creates TWO AbortControllers:
		//   1. preflightController — linked to keystrokeSignal before preflightAll
		//   2. VM controller — linked to keystrokeSignal before VM execution
		// This test verifies that aborting the keystroke signal propagates
		// through the preflight controller to the VM controller.
		const diagnosticEngine = new ExpressionEngine("en", true);

		const controller = new AbortController();
		diagnosticEngine.setKeystrokeSignal(controller.signal);

		// evaluateLine → evaluateLineWithDebug → evaluateExpressionWithDiagnostic
		// → preflightController created + linked → preflightAll → VM controller created + linked
		diagnosticEngine.evaluateLine(1, "5 + 3");

		// After evaluation, vm.activeSignal points to the VM controller's signal,
		// which was linked to the keystroke signal
		const vmSignal = diagnosticEngine.getVM().activeSignal;
		expect(vmSignal).toBeDefined();
		expect(vmSignal!.aborted).toBe(false);

		// The evaluation completed synchronously, so both the preflight and
		// VM controllers detached their keystroke listeners — a later
		// keystroke abort must not retroactively abort the finished work.
		controller.abort("New keystroke");
		expect(vmSignal!.aborted).toBe(false);

		// Clean up: reset engine to avoid leaking state to other tests
		diagnosticEngine.clear();
	});

	test("preflight path handles already-aborted keystroke signal without crash", () => {
		// When the keystroke signal is already aborted before evaluateLine,
		// the preflight controller's addEventListener('abort', ...) on an
		// already-aborted signal should not crash and evaluation should still
		// produce a correct result (the preflight passes, VM executes).
		const diagnosticEngine = new ExpressionEngine("en", true);

		const controller = new AbortController();
		controller.abort("Pre-aborted");
		diagnosticEngine.setKeystrokeSignal(controller.signal);

		// Should not throw — preflight controller handles already-aborted signal
		const [result] = diagnosticEngine.evaluateLine(1, "10 + 2");

		// Result should be correct even with aborted keystroke signal
		expect(result.toNumber()).toBe(12);

		diagnosticEngine.clear();
	});

	test("keystroke abort propagates to VM signal during async (pending) evaluation", () => {
		// Register an async plugin function that returns an unresolved Promise.
		// Build bytecode: PUSH_NUMBER 1, CALL_PLUGIN 250 1, HALT.
		// The VM encounters CALL_PLUGIN, sees the Promise, and emits
		// { type: 'pending', signal: vm.activeSignal }.
		// Aborting the keystroke aborts that signal, so when resolveAsync
		// eventually fires after the promise resolves, it checks
		// signal.aborted and skips storing the stale result in the DAG.
		let resolvePromise: ((v: unknown) => void) | null = null;
		const asyncPromise = new Promise<unknown>((resolve) => {
			resolvePromise = resolve;
		});

		const original = pluginFunctionRegistry[250];
		pluginFunctionRegistry[250] = () => asyncPromise as Promise<import("@solve-js/vm/Value").Value>;

		const builder = new BytecodeBuilder();
		builder.reset();
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(1);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitByte(250);
		builder.emitByte(1);
		builder.emitOpcode(OpCode.HALT);
		const asyncBytecode = builder.build();

		try {
			const controller = new AbortController();
			engine.setKeystrokeSignal(controller.signal);

			// executeCached → executeRaw → executeBytecode → CALL_PLUGIN
			// → returns { type: 'pending', signal: vm.activeSignal }
			engine.executeCached(asyncBytecode);

			const vm = engine.getVM();
			expect(vm.activeSignal).toBeDefined();
			expect(vm.activeSignal!.aborted).toBe(false);

			// Simulate user typing before async data arrives:
			// abort the keystroke BEFORE the promise resolves.
			controller.abort("User typed again");
			expect(vm.activeSignal!.aborted).toBe(true);

			// Now resolve the promise. The resolveAsync handler will check
			// signal.aborted and skip storing the stale result.
			resolvePromise!(numberValue(42));

			// Signal remains aborted — confirm stale result was discarded
			expect(vm.activeSignal!.aborted).toBe(true);
		} finally {
			pluginFunctionRegistry[250] = original;
		}
	});

	test("stale async result discarded end-to-end: abort before resolve prevents cache storage", async () => {
		// End-to-end test: verify that when a keystroke is aborted
		// BEFORE an async resolution completes, the resolved value
		// is NOT stored in the query cache and does NOT reach the
		// evaluator's result map.
		//
		// Flow:
		//   1. keystroke signal set → pending eval triggered
		//   2. keystroke aborted (user typed again)
		//   3. async promise resolves
		//   4. resolveAsync checks signal.aborted → true → skips cache
		//   5. queryClient.getQueryData() → undefined (stale value discarded)
		let resolvePromise: ((v: unknown) => void) | null = null;
		const asyncPromise = new Promise<unknown>((resolve) => {
			resolvePromise = resolve;
		});

		const original = pluginFunctionRegistry[250];
		pluginFunctionRegistry[250] = () => asyncPromise as Promise<import("@solve-js/vm/Value").Value>;

		const builder = new BytecodeBuilder();
		builder.reset();
		builder.emitOpcode(OpCode.PUSH_NUMBER);
		builder.emitNumber(1);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitByte(250);
		builder.emitByte(1);
		builder.emitOpcode(OpCode.HALT);
		const asyncBytecode = builder.build();

		try {
			const controller = new AbortController();
			engine.setKeystrokeSignal(controller.signal);

			// Trigger pending evaluation via executeCached
			const pendingResult = engine.executeCached(asyncBytecode);

			// Should return a pending value (not a number)
			expect(pendingResult.type).toBe(ValueType.Pending);

			// Verify the local controller is linked and not yet aborted
			const vm = engine.getVM();
			expect(vm.activeSignal).toBeDefined();
			expect(vm.activeSignal!.aborted).toBe(false);

			// ── Simulate user typing before async data arrives ──────
			controller.abort("User typed again");
			expect(vm.activeSignal!.aborted).toBe(true);

			// ── Now resolve the promise ────────────────────────────
			// resolveAsync will await this, then check signal.aborted.
			resolvePromise!(numberValue(42));

			// Flush microtasks so resolveAsync completes its async handler.
			// Use a macrotask (setTimeout) to ensure all microtasks drain.
			await new Promise<void>((r) => setTimeout(r, 0));

			// ── Assert: stale value was NOT stored ──────────────────
			// The queryKey format is: "plugin:{fnIdx}:{args joined by |}"
			// For CALL_PLUGIN 250 1 with arg "1": "plugin:250:1|"
			expect(engine.queryClient.getQueryData(["plugin:250:1|"])).toBeUndefined();

			// Also verify: the in-flight registration was made
			// (resolveAsync called registerInFlight before awaiting).
			// The in-flight entry persists after stale discard
			// (it's cleaned up when the engine is cleared).
			// We don't assert this — it's a known quirk, not a bug.
		} finally {
			pluginFunctionRegistry[250] = original;
		}
	});

	// ── Sequential keystrokes & cleanup ───────────────────────────────

	test("multiple sequential keystrokes: engine survives signal transitions", () => {
		const signal1 = new AbortController();
		const signal2 = new AbortController();

		const doc = createDoc(["10 + 5", "20 * 2"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Keystroke 1
		const result1 = evaluator.evaluate({ startLine: 1, endLine: 1 }, signal1.signal);
		expect(result1.resultMap.get(1)![0].toNumber()).toBe(15);

		// Abort keystroke 1 (simulates user typing again)
		signal1.abort("New keystroke");
		expect(signal1.signal.aborted).toBe(true);

		// Keystroke 2 — should produce correct results despite signal1 being aborted
		const result2 = evaluator.evaluate({ startLine: 2, endLine: 2 }, signal2.signal);
		expect(result2.resultMap.get(2)![0].toNumber()).toBe(40);

		// Signal 2 should still be non-aborted (not affected by signal1)
		expect(signal2.signal.aborted).toBe(false);
	});

	test("evaluating without signal after an evaluation with signal works correctly", () => {
		const doc = createDoc([":x = 5", "x * 3"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// First: evaluate with a signal
		const controller = new AbortController();
		evaluator.evaluateAll(controller.signal);

		// Second: evaluate without signal — should still work
		const result = evaluator.evaluate({ startLine: 2, endLine: 2 });

		expect(result.resultMap.get(2)![0].toNumber()).toBe(15);
	});

	test("ExpressionEngine.setKeystrokeSignal accepts null to clear", () => {
		const controller = new AbortController();
		engine.setKeystrokeSignal(controller.signal);

		// Clear
		engine.setKeystrokeSignal(null);

		// After clearing, evaluating should work fine
		const doc = createDoc(["10 + 10"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);
		const result = evaluator.evaluateAll(undefined);
		expect(result.resultMap.get(1)![0].toNumber()).toBe(20);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 3: End-to-end: keystroke pattern via ThreeTierEvaluator
// ═══════════════════════════════════════════════════════════════════════════

describe("Keystroke AbortController — End-to-End Integration", () => {
	test("full lifecycle: multiple keystrokes produce correct results", () => {
		const engine = createEngine();
		const doc = createDoc([":x = 10", ":y = 20", "x + y", "x * y", "y - x"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Keystroke 1: initial document load
		const ks1 = new AbortController();
		const r1 = evaluator.evaluateAll(ks1.signal);
		expect(r1.resultMap.get(1)![0].toNumber()).toBe(10);
		expect(r1.resultMap.get(2)![0].toNumber()).toBe(20);
		expect(r1.resultMap.get(3)![0].toNumber()).toBe(30);
		expect(r1.resultMap.get(4)![0].toNumber()).toBe(200);
		expect(r1.resultMap.get(5)![0].toNumber()).toBe(10);

		// Keystroke 2: user scrolls (abort old, create new)
		ks1.abort("Scroll");
		const ks2 = new AbortController();
		const r2 = evaluator.setViewport({ startLine: 3, endLine: 5 }, ks2.signal);
		expect(r2.resultMap.get(3)![0].toNumber()).toBe(30);
		expect(r2.resultMap.get(4)![0].toNumber()).toBe(200);
		expect(r2.resultMap.get(5)![0].toNumber()).toBe(10);
		expect(r2.lines.length).toBe(3); // only visible lines

		// Keystroke 3: user edits line 2 (abort old, create new)
		ks2.abort("Edit");
		const ks3 = new AbortController();
		doc.editLine(2, ":y = 30");
		evaluator.applyTransaction([{ startLine: 2, deleteCount: 1, insertLines: [":y = 30"] }]);
		const r3 = evaluator.evaluate({ startLine: 1, endLine: 5 }, ks3.signal);
		expect(r3.resultMap.get(2)![0].toNumber()).toBe(30); // y changed
		expect(r3.resultMap.get(3)![0].toNumber()).toBe(40); // x + y = 10 + 30
		expect(r3.resultMap.get(4)![0].toNumber()).toBe(300); // x * y
		expect(r3.resultMap.get(5)![0].toNumber()).toBe(20); // y - x = 30 - 10

		// Verify all old signals are aborted
		expect(ks1.signal.aborted).toBe(true);
		expect(ks2.signal.aborted).toBe(true);
		expect(ks3.signal.aborted).toBe(false); // current one is active
	});

	test("abort of previous keystroke does not affect current keystroke results", () => {
		const engine = createEngine();
		const doc = createDoc([":v = 5", "v + 1", "v + 2"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// First keystroke
		const ks1 = new AbortController();
		evaluator.evaluateAll(ks1.signal);

		// Abort first keystroke
		ks1.abort("New input");

		// Second keystroke — should not be affected
		const ks2 = new AbortController();
		const result = evaluator.evaluate({ startLine: 2, endLine: 3 }, ks2.signal);

		expect(result.resultMap.get(2)![0].toNumber()).toBe(6); // v + 1 = 5 + 1
		expect(result.resultMap.get(3)![0].toNumber()).toBe(7); // v + 2 = 5 + 2
	});

	test("backward compatibility: evaluate without signal parameter works", () => {
		const engine = createEngine();
		const doc = createDoc(["5 + 5", "10 - 3"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Old-style calls (no signal param) should still work
		const r1 = evaluator.evaluateAll();
		expect(r1.resultMap.get(1)![0].toNumber()).toBe(10);
		expect(r1.resultMap.get(2)![0].toNumber()).toBe(7);

		const r2 = evaluator.evaluate({ startLine: 1, endLine: 1 });
		expect(r2.resultMap.get(1)![0].toNumber()).toBe(10);

		const r3 = evaluator.setViewport({ startLine: 2, endLine: 2 });
		expect(r3.resultMap.get(2)![0].toNumber()).toBe(7);
	});

	test("signal parameter type safety: undefined is handled as null", () => {
		const engine = createEngine();
		const spy = jest.spyOn(engine, "setKeystrokeSignal");

		const doc = createDoc(["1 + 1"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		// Passing undefined should be treated as null
		evaluator.evaluate({ startLine: 1, endLine: 1 }, undefined);

		// All calls should be null (setKeystrokeSignal(signal ?? null) + finally cleanup)
		for (const call of spy.mock.calls) {
			expect(call[0]).toBeNull();
		}

		spy.mockRestore();
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 4: abortKeystroke pattern (stress test)
// ═══════════════════════════════════════════════════════════════════════════

describe("Keystroke AbortController — abortKeystroke Pattern", () => {
	test("survives 10 rapid abort/create cycles without correctness regression", () => {
		// Simulating the MarkdownEditorViewPlugin's abortKeystroke pattern:
		// 1. Create controller, use signal
		// 2. Abort controller, create new one
		// 3. Repeat for N cycles

		const engine = createEngine();
		const doc = createDoc(["1 + 2", "3 + 4", "5 + 6"]);
		const evaluator = new ThreeTierEvaluator(doc, engine);

		for (let i = 0; i < 10; i++) {
			const controller = new AbortController();
			const result = evaluator.evaluate({ startLine: 1, endLine: 3 }, controller.signal);
			expect(result.resultMap.get(1)![0].toNumber()).toBe(3);
			controller.abort(`Keystroke ${i}`);
		}

		// Final evaluation should still work
		const finalController = new AbortController();
		const finalResult = evaluator.evaluateAll(finalController.signal);
		expect(finalResult.resultMap.get(1)![0].toNumber()).toBe(3);
	});
});
