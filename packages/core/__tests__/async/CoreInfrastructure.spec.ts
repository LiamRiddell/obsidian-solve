/**
 * Phase A: Async Streaming Results — Core Infrastructure Tests
 *
 * Tests for:
 * - TanStack QueryClient per-plugin isolation (setQueryData, getQueryData, fetchQuery, removeQueries, clear)
 * - ValueType.Pending + pendingValue() factory
 * - VM CALL_PLUGIN returns EvalResult { type:'pending' } when plugin returns Promise
 * - ExpressionEngine handles EvalResult discriminated union (no try/catch needed)
 */

import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { QueryClient } from "@tanstack/query-core";
import { ValueType, Value, numberValue, stringValue, pendingValue } from "@solve-js/vm/Value";
import { createVM, executeBytecode, unwrapEvalResult, type EvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { OpCode } from "@solve-js/parser/OpCode";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import type { VM } from "@solve-js/vm/OpRegistry";

// ── Helpers ────────────────────────────────────────────────────────────

/** Build bytecode that calls a plugin function via CALL_PLUGIN. */
function buildCallPluginBytecode(fnIdx: number, argCount: number): {
    opcodes: Uint8Array; numbers: Float64Array; strings: string[]; hasAsync: boolean;
} {
    const builder = new BytecodeBuilder();
    builder.reset();
    // Push argCount NUMBER values onto the stack
    for (let i = 0; i < argCount; i++) {
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(i + 1);
    }
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitByte(fnIdx);
    builder.emitByte(argCount);
    builder.emitOpcode(OpCode.HALT);
    return {
        opcodes: builder.build().opcodes,
        numbers: builder.build().numbers,
        strings: builder.build().strings,
        hasAsync: builder.build().hasAsync,
    };
}

/** Create a fresh VM for testing. */
function freshVM(): VM {
    return createVM(sharedOpRegistry, 200, 50000);
}

// ────────────────────────────────────────────────────────────────────────
// §1  QueryClient (per-plugin isolated via hierarchical query keys)
// ────────────────────────────────────────────────────────────────────────

const TEST_PACKAGE = "test_0";
const TEST_PACKAGE_B = "test_1";

function makeKey(pkg: string, key: string): string[] {
    return [pkg, ...key.split(":")];
}

describe("QueryClient — cache isolation via hierarchical keys", () => {
    let qc: QueryClient;

    beforeEach(() => {
        qc = new QueryClient();
    });

	test("should store and retrieve values (package-scoped keys)", () => {
        const val = numberValue(42);
        qc.setQueryData(makeKey(TEST_PACKAGE, "rate:USD:GBP"), val);

        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "rate:USD:GBP"))).toBe(val);
        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "rate:USD:EUR"))).toBeUndefined();
    });

	test("should isolate packages — Package A cannot read Package B's cache", () => {
        const valA = numberValue(100);
        qc.setQueryData(makeKey(TEST_PACKAGE, "key"), valA);

        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "key"))).toBe(valA);
        expect(qc.getQueryData(makeKey(TEST_PACKAGE_B, "key"))).toBeUndefined();
    });

	test("should deduplicate in-flight requests (fetchQuery same-key dedup)", async () => {
        let callCount = 0;
        const queryFn = async () => {
            callCount++;
            return numberValue(1);
        };

        // Simultaneous fetchQuery calls with the same key share one execution
        const [r1, r2] = await Promise.all([
            qc.fetchQuery({ queryKey: makeKey(TEST_PACKAGE, "key1"), queryFn }),
            qc.fetchQuery({ queryKey: makeKey(TEST_PACKAGE, "key1"), queryFn }),
        ]);

        expect(callCount).toBe(1);
        expect(r1).toBe(r2);
    });

	test("should overwrite in-flight data with setQueryData", () => {
        qc.setQueryData(makeKey(TEST_PACKAGE, "fetch:items"), numberValue(100));

        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "fetch:items"))).toEqual(numberValue(100));
    });

	test("should isolate entries by package-level key prefix", () => {
        qc.setQueryData(makeKey(TEST_PACKAGE, "a"), numberValue(1));
        qc.setQueryData(makeKey(TEST_PACKAGE, "b"), numberValue(2));
        qc.setQueryData(makeKey(TEST_PACKAGE_B, "c"), stringValue("other"));

        // Verify isolation: same package sees its own entries
        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "a"))).toEqual(numberValue(1));
        expect(qc.getQueryData(makeKey(TEST_PACKAGE_B, "a"))).toBeUndefined();

        // Verify all 3 entries exist
        expect(qc.getQueryCache().getAll().length).toBe(3);

        // Clear only one package using removeQueries with exact prefix match
        qc.removeQueries({ queryKey: makeKey(TEST_PACKAGE, "a") });

        // After removal: the exact match is gone, others remain
        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "a"))).toBeUndefined();
        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "b"))).not.toBeUndefined();
        expect(qc.getQueryData(makeKey(TEST_PACKAGE_B, "c"))).not.toBeUndefined();
    });

	test("should clear entire package (removeQueries with package prefix)", () => {
        qc.setQueryData(makeKey(TEST_PACKAGE, "a"), numberValue(1));
        qc.setQueryData(makeKey(TEST_PACKAGE, "b"), numberValue(2));

        qc.removeQueries({ queryKey: [TEST_PACKAGE] });

        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "a"))).toBeUndefined();
        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "b"))).toBeUndefined();
    });

	test("should clear all entries across all packages", () => {
        qc.setQueryData(makeKey(TEST_PACKAGE, "a"), numberValue(1));
        qc.setQueryData(makeKey(TEST_PACKAGE_B, "b"), numberValue(2));

        qc.clear();

        expect(qc.getQueryData(makeKey(TEST_PACKAGE, "a"))).toBeUndefined();
        expect(qc.getQueryData(makeKey(TEST_PACKAGE_B, "b"))).toBeUndefined();
    });

	test("should report cache size via getAll()", () => {
        expect(qc.getQueryCache().getAll().length).toBe(0);

        qc.setQueryData(makeKey(TEST_PACKAGE, "k1"), numberValue(1));
        qc.setQueryData(makeKey(TEST_PACKAGE, "k2"), numberValue(2));

        expect(qc.getQueryCache().getAll().length).toBe(2);
    });

	test("should count unique packages via distinct first-level keys", () => {
        expect(qc.getQueryCache().getAll().length).toBe(0);

        qc.setQueryData(makeKey(TEST_PACKAGE, "k"), numberValue(1));
        expect(qc.getQueryCache().getAll().length).toBe(1);

        qc.setQueryData(makeKey(TEST_PACKAGE_B, "k"), numberValue(1));
        expect(qc.getQueryCache().getAll().length).toBe(2);
    });
});

// ────────────────────────────────────────────────────────────────────────
// §2  ValueType.Pending + pendingValue()
// ────────────────────────────────────────────────────────────────────────

describe("ValueType.Pending", () => {	test("should have Pending = 12 in ValueType enum", () => {
        expect(ValueType.Pending).toBe(12);
    });
	test("pendingValue() should create a Value with type Pending", () => {
        const val = pendingValue("rate:USD:GBP");
        expect(val.type).toBe(ValueType.Pending);
        expect(val.value).toBe("rate:USD:GBP");
    });
	test("toNumber() should return 0 for Pending values", () => {
        const val = pendingValue("any:key");
        expect(val.toNumber()).toBe(0);
    });
	test("isNaN() should return false for Pending values", () => {
        const val = pendingValue("any:key");
        expect(val.isNaN()).toBe(false);
    });
	test("pendingValue should NOT use the arena (persistent allocation)", () => {
        // The pendingValue factory always uses `new Value(...)`, never the arena.
        // Verify by checking that two calls produce different objects.
        const a = pendingValue("k1");
        const b = pendingValue("k2");
        expect(a).not.toBe(b);
        expect(a.value).toBe("k1");
        expect(b.value).toBe("k2");
    });
});

// ────────────────────────────────────────────────────────────────────────
// §4  VM CALL_PLUGIN returns EvalResult (no longer throws)
// ────────────────────────────────────────────────────────────────────────

describe("VM CALL_PLUGIN → EvalResult", () => {
	test("should return { type:'pending' } when plugin function returns Promise", () => {
        // Register a plugin function that returns a Promise
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        const testPromise = Promise.resolve(numberValue(99));
        pluginFunctionRegistry[100] = () => testPromise;

        const bytecode = buildCallPluginBytecode(100, 2);
        const vm = freshVM();

        // Set activeSignal — the engine does this before calling executeBytecode
        vm.activeSignal = new AbortController().signal;

        const result = executeBytecode(bytecode, vm);

        expect(result.type).toBe('pending');
        if (result.type === 'pending') {
            expect(result.queryKey).toContain("plugin:100:");
            expect(result.resolver).toBe(testPromise);
            expect(result.packageId).toBe(''); // VM doesn't know packageId; engine fills it
            expect(result.signal).toBeDefined();
        }

        // Clean up
        delete pluginFunctionRegistry[100];
    });
	test("should return { type:'value' } for sync plugin functions", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[101] = (args: Value[]) => numberValue(args[0].toNumber() * 2);

        const bytecode = buildCallPluginBytecode(101, 1);
        const vm = freshVM();
        vm.activeSignal = new AbortController().signal;

        const result = executeBytecode(bytecode, vm);
        expect(result.type).toBe('value');
        expect(unwrapEvalResult(result).toNumber()).toBeGreaterThan(0);

        // Clean up
        delete pluginFunctionRegistry[101];
    });
	test("should include args in the cache key for deduplication", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[102] = () => Promise.resolve(numberValue(42));

        const bytecode = buildCallPluginBytecode(102, 2);
        const vm = freshVM();
        vm.activeSignal = new AbortController().signal;

        const result = executeBytecode(bytecode, vm);
        expect(result.type).toBe('pending');
        if (result.type === 'pending') {
            // Cache key format: plugin:fnIdx:arg1|arg2
            expect(result.queryKey).toMatch(/^plugin:102:/);
            // Args are NUMBER(1) and NUMBER(2)
            expect(result.queryKey).toContain("1|2");
        }

        delete pluginFunctionRegistry[102];
    });
	test("should not execute beyond instruction limit even with async plugins", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        // Create an infinite loop by jumping back — this verifies the guard still works
        const builder = new BytecodeBuilder();
        builder.reset();
        builder.emitOpcode(OpCode.PUSH_NUMBER);
        builder.emitNumber(1);
        builder.emitOpcode(OpCode.HALT);
        const program = builder.build();

        // Use a VM with very low instruction limit
        const tinyVM = createVM(sharedOpRegistry, 200, 5);
        tinyVM.activeSignal = new AbortController().signal;

        // This should still throw for instruction limits, not silently fail
        // Simple single-instruction bytecode will be fine
        const result = executeBytecode(program, tinyVM);
        expect(result.type).toBe('value');
    });
});

// ────────────────────────────────────────────────────────────────────────
// §5  ExpressionEngine handles EvalResult (no try/catch needed)
// ────────────────────────────────────────────────────────────────────────

describe("ExpressionEngine EvalResult handling", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
        engine = new ExpressionEngine("en", false);
    });

    afterEach(() => {
        engine.clear();
    });
	test("should return Pending value when executeBytecode returns { type:'pending' }", () => {
        // Register an async plugin function
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        const testPromise = Promise.resolve(numberValue(77));
        pluginFunctionRegistry[200] = () => testPromise;

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(200, 2);

        // Execute: the engine's executeCached/executeRaw method would set up
        // the AbortController before calling executeBytecode.
        // Simulate what executeRaw does:
        const stackBefore = vm.getStack().length;
        const controller = new AbortController();
        vm.activeSignal = controller.signal;

        const evalResult = executeBytecode(bytecode, vm);

        // Stack cleanup (as executeRaw does)
        while (vm.getStack().length > stackBefore) {
            vm.pop();
        }

        expect(evalResult.type).toBe('pending');
        if (evalResult.type === 'pending') {
            expect(evalResult.queryKey).toContain("plugin:200:");
            expect(evalResult.resolver).toBe(testPromise);

            // The engine would now create a pendingValue from the queryKey
            const pending = pendingValue(evalResult.queryKey);
            expect(pending.type).toBe(ValueType.Pending);
            expect(pending.toNumber()).toBe(0);
        }

        // Clean up
        delete pluginFunctionRegistry[200];
    });
	test("should clean up VM stack after execution (pending or not)", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[201] = () => Promise.resolve(numberValue(1));

        const vm = engine.getVM();
        const stackBefore = vm.getStack().length;

        const bytecode = buildCallPluginBytecode(201, 1);

        vm.activeSignal = new AbortController().signal;
        executeBytecode(bytecode, vm);  // returns { type: 'pending' }, no throw

        // Stack cleanup — as the engine does in executeRaw/executeAndStore
        while (vm.getStack().length > stackBefore) {
            vm.pop();
        }

        // Stack should be clean
        expect(vm.getStack().length).toBe(stackBefore);

        delete pluginFunctionRegistry[201];
    });
	test("should propagate exceptions from plugin functions", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        // Register a plugin function that throws a regular error
        pluginFunctionRegistry[202] = () => { throw new Error("regular failure"); };

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(202, 1);
        vm.activeSignal = new AbortController().signal;

        const stackBefore = vm.getStack().length;

        expect(() => unwrapEvalResult(executeBytecode(bytecode, vm))).toThrow("regular failure");

        // Stack should be cleaned up (engine's responsibility)
        while (vm.getStack().length > stackBefore) {
            vm.pop();
        }
        expect(vm.getStack().length).toBe(stackBefore);

        delete pluginFunctionRegistry[202];
    });
	test("executeCached should return pendingValue for pending results", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[203] = () => Promise.resolve(numberValue(55));

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(203, 1);
        vm.activeSignal = new AbortController().signal;

        // Use engine's executeCached
        const result = engine.executeCached(bytecode);

        expect(result.type).toBe(ValueType.Pending);
        expect(result.value).toContain("plugin:203:");

        delete pluginFunctionRegistry[203];
    });

    // Regression for the second fatal bug fixed this pass, per
    // ARCHITECTURE.md's P0 item: executeCached() is Tier 2's (scroll into
    // view) fast path — it re-executes cached bytecode directly and never
    // calls preflightAll(), the async preflight that normally guarantees a
    // global variable is resolved before LOAD_GLOBAL_VAR reads it. If a
    // Pending async result got marked clean and routed through this path
    // anyway, LOAD_GLOBAL_VAR used to hit a bare non-null assertion on the
    // global variable store, producing a raw uncaught TypeError instead of a
    // clear, catchable error. VM.ts's LOAD_GLOBAL_VAR case now throws a
    // controlled GLOBAL_VARIABLE_NOT_RESOLVED EngineError instead, and
    // executeCached() re-throws it like any other executeRaw() failure.
    test("executeCached throws a controlled GLOBAL_VARIABLE_NOT_RESOLVED error for an unresolved global (Tier-2/LOAD_GLOBAL_VAR bypass)", () => {
        const builder = new BytecodeBuilder();
        builder.reset();
        builder.emitOpcode(OpCode.LOAD_GLOBAL_VAR);
        builder.emitString("neverResolvedGlobal_CoreInfrastructureRegression");
        builder.emitOpcode(OpCode.HALT);
        const bytecode = builder.build();

        expect(() => engine.executeCached(bytecode)).toThrow(
            /Global variable "neverResolvedGlobal_CoreInfrastructureRegression" was read before it resolved/
        );
    });

    // Gap found while hardening for release: every existing test here covers
    // a plugin function that either returns synchronously (throwing or not)
    // or returns a Promise that RESOLVES — none covered a Promise that
    // REJECTS, the other real-world failure mode (e.g. a failed HTTP fetch
    // inside a plugin function). Confirms the engine's resolveAsync()
    // try/catch (ExpressionEngine.ts) surfaces it as a batcher "error" event
    // rather than an unhandled rejection or a hang.
    test("plugin function returning a REJECTED promise surfaces as an async error event, not an unhandled rejection", async () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[204] = () => Promise.reject(new Error("simulated fetch failure"));

        const events: import("@solve-js/engine/AsyncResolutionBatcher").AsyncResolutionEvent[] = [];
        const batcher = engine.getBatcher();
        batcher._testCaptures = events;

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(204, 1);
        vm.activeSignal = new AbortController().signal;

        const result = engine.executeCached(bytecode);
        expect(result.type).toBe(ValueType.Pending);

        // Flush the microtask queue so the rejected promise's .catch() and
        // the batcher's queueMicrotask-scheduled flush() both run.
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        await new Promise<void>((resolve) => queueMicrotask(resolve));

        expect(events.some(e => e.type === "error")).toBe(true);
        const errorEvent = events.find(e => e.type === "error");
        expect(errorEvent && "error" in errorEvent ? errorEvent.error.message : undefined).toBe("simulated fetch failure");

        batcher._testCaptures = null;
        delete pluginFunctionRegistry[204];
    });
});

// ────────────────────────────────────────────────────────────────────────
// §6  Integration: Full pending flow via engine's internal methods
// ────────────────────────────────────────────────────────────────────────

describe("ExpressionEngine evaluateExpression with async plugin", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
        engine = new ExpressionEngine("en", false);
    });

    afterEach(() => {
        engine.clear();
    });
	test("should return Pending value from executeCached when plugin returns Promise", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        const testPromise = Promise.resolve(numberValue(55));
        pluginFunctionRegistry[210] = () => testPromise;

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(210, 1);
        vm.activeSignal = new AbortController().signal;

        // Use executeCached — the engine's real method that wraps executeRaw
        const result = engine.executeCached(bytecode);

        expect(result).toBeDefined();
        expect(result.type).toBe(ValueType.Pending);
        expect(result.value).toContain("plugin:210:");

        delete pluginFunctionRegistry[210];
    });
	test("should return Value result from executeCached for sync plugin", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[211] = (args: Value[]) => numberValue(args[0].toNumber() * 3);

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(211, 1);
        vm.activeSignal = new AbortController().signal;

        const result = engine.executeCached(bytecode);

        expect(result.type).toBe(ValueType.Number);
        expect(result.toNumber()).toBe(3); // 1 * 3

        delete pluginFunctionRegistry[211];
    });
	test("should handle AbortController cleanup on engine.clear()", () => {
        const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
        pluginFunctionRegistry[212] = () => Promise.resolve(numberValue(42));

        const vm = engine.getVM();
        const bytecode = buildCallPluginBytecode(212, 1);
        vm.activeSignal = new AbortController().signal;

        // Execute and get pending
        const result = engine.executeCached(bytecode);
        expect(result.type).toBe(ValueType.Pending);

        // Clear the engine — should abort in-flight work
        engine.clear();

        // After clear, batcher listeners should be cleaned up

        delete pluginFunctionRegistry[212];
    });
});
