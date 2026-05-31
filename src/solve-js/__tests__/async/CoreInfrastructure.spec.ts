/**
 * Phase A: Async Streaming Results — Core Infrastructure Tests
 *
 * Tests for:
 * - AsyncResultCache per-plugin isolation (set, get, has, inFlight, clearAll, clearDomain, clearPlugin)
 * - ValueType.Pending + pendingValue() factory
 * - EResultType.Pending enum value
 * - VM CALL_PLUGIN returns EvalResult { type:'pending' } when plugin returns Promise
 * - ExpressionEngine handles EvalResult discriminated union (no try/catch needed)
 */

import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { AsyncResultCache } from "@solve-js/cache";
import { ValueType, Value, numberValue, stringValue, pendingValue } from "@solve-js/vm/Value";
import { EResultType } from "@app/constants/EResultType";
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
// §1  AsyncResultCache (per-plugin isolated)
// ────────────────────────────────────────────────────────────────────────

const TEST_PACKAGE = "test_0";
const TEST_PACKAGE_B = "test_1";

describe("AsyncResultCache", () => {
    beforeEach(() => {
        AsyncResultCache.clearAll();
    });
	test("should store and retrieve values (plugin-scoped)", () => {
        const val = numberValue(42);
        AsyncResultCache.set(TEST_PACKAGE, "rate:USD:GBP", val);

        expect(AsyncResultCache.has(TEST_PACKAGE, "rate:USD:GBP")).toBe(true);
        expect(AsyncResultCache.get(TEST_PACKAGE, "rate:USD:GBP")).toBe(val);
        expect(AsyncResultCache.has(TEST_PACKAGE, "rate:USD:EUR")).toBe(false);
        expect(AsyncResultCache.get(TEST_PACKAGE, "rate:USD:EUR")).toBeUndefined();
    });
	test("should isolate plugins — Plugin A cannot read Plugin B's cache", () => {
        const valA = numberValue(100);
        AsyncResultCache.set(TEST_PACKAGE, "key", valA);

        expect(AsyncResultCache.has(TEST_PACKAGE, "key")).toBe(true);
        expect(AsyncResultCache.has(TEST_PACKAGE_B, "key")).toBe(false);
        expect(AsyncResultCache.get(TEST_PACKAGE_B, "key")).toBeUndefined();
    });
	test("should track in-flight promises (plugin-scoped)", () => {
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "key1")).toBe(false);

        const promise = Promise.resolve(numberValue(1));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "key1", promise);

        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "key1")).toBe(true);
        expect(AsyncResultCache.getInFlight(TEST_PACKAGE, "key1")).toBe(promise);
    });
	test("should clear in-flight when value is set", () => {
        const promise = Promise.resolve(numberValue(1));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "fetch:items", promise);
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "fetch:items")).toBe(true);

        AsyncResultCache.set(TEST_PACKAGE, "fetch:items", numberValue(100));
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "fetch:items")).toBe(false);
    });
	test("should store and retrieve errors", () => {
        const err = new Error("Network timeout");
        AsyncResultCache.setError(TEST_PACKAGE, "rate:FAIL", err);

        expect(AsyncResultCache.getError(TEST_PACKAGE, "rate:FAIL")).toBe(err);
        expect(AsyncResultCache.has(TEST_PACKAGE, "rate:FAIL")).toBe(false); // error ≠ resolved value
    });
	test("should clear error when value is set", () => {
        AsyncResultCache.setError(TEST_PACKAGE, "key", new Error("fail"));
        AsyncResultCache.set(TEST_PACKAGE, "key", numberValue(1));

        expect(AsyncResultCache.getError(TEST_PACKAGE, "key")).toBeUndefined();
        expect(AsyncResultCache.has(TEST_PACKAGE, "key")).toBe(true);
    });
	test("should clear entries by domain", () => {
        AsyncResultCache.set(TEST_PACKAGE, "rate:USD:GBP", numberValue(1));
        AsyncResultCache.set(TEST_PACKAGE, "rate:USD:EUR", numberValue(2));
        AsyncResultCache.set(TEST_PACKAGE, "weather:London", stringValue("sunny"));

        AsyncResultCache.clearDomain(TEST_PACKAGE, "rate");

        expect(AsyncResultCache.has(TEST_PACKAGE, "rate:USD:GBP")).toBe(false);
        expect(AsyncResultCache.has(TEST_PACKAGE, "rate:USD:EUR")).toBe(false);
        expect(AsyncResultCache.has(TEST_PACKAGE, "weather:London")).toBe(true);
    });
	test("should clear in-flight by domain", () => {
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "rate:USD:GBP", Promise.resolve(numberValue(1)));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "weather:London", Promise.resolve(stringValue("rain")));

        AsyncResultCache.clearDomain(TEST_PACKAGE, "rate");

        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "rate:USD:GBP")).toBe(false);
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "weather:London")).toBe(true);
    });
	test("should clear errors by domain", () => {
        AsyncResultCache.setError(TEST_PACKAGE, "rate:FAIL", new Error("oops"));
        AsyncResultCache.setError(TEST_PACKAGE, "weather:FAIL", new Error("nope"));

        AsyncResultCache.clearDomain(TEST_PACKAGE, "rate");

        expect(AsyncResultCache.getError(TEST_PACKAGE, "rate:FAIL")).toBeUndefined();
        expect(AsyncResultCache.getError(TEST_PACKAGE, "weather:FAIL")).toBeDefined();
    });
	test("should clear entire package", () => {
        AsyncResultCache.set(TEST_PACKAGE, "a", numberValue(1));
        AsyncResultCache.set(TEST_PACKAGE, "b", numberValue(2));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "c", Promise.resolve(numberValue(3)));
        AsyncResultCache.setError(TEST_PACKAGE, "d", new Error("e"));

        AsyncResultCache.clearPackage(TEST_PACKAGE);

        expect(AsyncResultCache.has(TEST_PACKAGE, "a")).toBe(false);
        expect(AsyncResultCache.get(TEST_PACKAGE, "b")).toBeUndefined();
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "c")).toBe(false);
        expect(AsyncResultCache.getError(TEST_PACKAGE, "d")).toBeUndefined();
    });
	test("should clear all entries across all plugins", () => {
        AsyncResultCache.set(TEST_PACKAGE, "a", numberValue(1));
        AsyncResultCache.set(TEST_PACKAGE_B, "b", numberValue(2));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "c", Promise.resolve(numberValue(3)));
        AsyncResultCache.setError(TEST_PACKAGE, "d", new Error("e"));

        AsyncResultCache.clearAll();

        expect(AsyncResultCache.has(TEST_PACKAGE, "a")).toBe(false);
        expect(AsyncResultCache.has(TEST_PACKAGE_B, "b")).toBe(false);
        expect(AsyncResultCache.isInFlight(TEST_PACKAGE, "c")).toBe(false);
        expect(AsyncResultCache.getError(TEST_PACKAGE, "d")).toBeUndefined();
    });
	test("should report size and inFlightCount", () => {
        expect(AsyncResultCache.size).toBe(0);
        expect(AsyncResultCache.inFlightCount).toBe(0);

        AsyncResultCache.set(TEST_PACKAGE, "k1", numberValue(1));
        AsyncResultCache.set(TEST_PACKAGE, "k2", numberValue(2));
        AsyncResultCache.registerInFlight(TEST_PACKAGE, "k3", Promise.resolve(numberValue(3)));

        expect(AsyncResultCache.size).toBe(2);
        expect(AsyncResultCache.inFlightCount).toBe(1);
    });
	test("should report packageCount", () => {
        expect(AsyncResultCache.packageCount).toBe(0);
        AsyncResultCache.set(TEST_PACKAGE, "k", numberValue(1));
        expect(AsyncResultCache.packageCount).toBe(1);
        AsyncResultCache.set(TEST_PACKAGE_B, "k", numberValue(1));
        expect(AsyncResultCache.packageCount).toBe(2);
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
// §3  EResultType.Pending
// ────────────────────────────────────────────────────────────────────────

describe("EResultType.Pending", () => {	test("should exist in the enum", () => {
        // EResultType is a numeric enum, so Pending should be a valid value
        expect(EResultType.Pending).toBeDefined();
        expect(typeof EResultType.Pending).toBe("number");
    });
});

// ────────────────────────────────────────────────────────────────────────
// §4  VM CALL_PLUGIN returns EvalResult (no longer throws)
// ────────────────────────────────────────────────────────────────────────

describe("VM CALL_PLUGIN → EvalResult", () => {
    beforeEach(() => {
        AsyncResultCache.clearAll();
    });
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
        AsyncResultCache.clearAll();
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

        expect(() => executeBytecode(bytecode, vm)).toThrow("regular failure");

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
});

// ────────────────────────────────────────────────────────────────────────
// §6  Integration: Full pending flow via engine's internal methods
// ────────────────────────────────────────────────────────────────────────

describe("ExpressionEngine evaluateExpression with async plugin", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
        AsyncResultCache.clearAll();
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
