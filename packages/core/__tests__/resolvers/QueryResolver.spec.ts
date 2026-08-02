/**
 * QueryResolver — generic single-query async resolver factory.
 *
 * Unit-tests preflight()/pluginFunction() directly against hand-built
 * CALL_PLUGIN bytecode (the same style AsyncPipelineIntegration.spec.ts
 * uses), rather than the full ExpressionEngine pipeline — this factory's
 * job is the bytecode-scanning + cache-key + fetch/error/cooldown logic,
 * which is fully exercised this way without the extra moving parts (DAG,
 * batcher, Tier1/2/3 evaluator) a full end-to-end test would drag in.
 */

import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { QueryClient } from "@tanstack/query-core";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType, numberValue, stringValue, uomValue } from "@solve-js/vm/Value";
import { setActiveQueryClient } from "@solve-js/services/DataQueryService";
import { createQueryResolver } from "@solve-js/resolvers/QueryResolver";

const TEST_FN_IDX = 250; // arbitrary, unused elsewhere in these tests

/** Builds PUSH_STRING(query), CALL_PLUGIN(fnIdx, 1), HALT — the exact shape createQueryResolver's preflight() scans for. */
function buildQueryBytecode(query: string, fnIdx: number) {
  const builder = new BytecodeBuilder();
  builder.emitOpcode(OpCode.PUSH_STRING);
  builder.emitString(query);
  builder.emitOpcode(OpCode.CALL_PLUGIN);
  builder.emitByte(fnIdx);
  builder.emitByte(1);
  builder.emitOpcode(OpCode.HALT);
  return builder.build();
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * Hand-built bytecode for a CALL_USER_FUNCTION immediately followed by the
 * PUSH_STRING(query)/CALL_PLUGIN(fnIdx, 1) pair preflight() scans for —
 * models a document line that calls a user function (`f(5)`) before the
 * query call.
 *
 * Uses raw arrays instead of BytecodeBuilder because this test needs exact
 * control over two specific operand VALUES, not just correct shape:
 *
 * - nameIdx is set to OpCode.CALL_BUILTIN's own numeric value (51) rather
 *   than an arbitrary small index. If CALL_USER_FUNCTION's case were
 *   missing from the operand-width switch, the (buggy) scanner misreads
 *   this byte as an actual CALL_BUILTIN opcode and jumps by ITS width
 *   instead of just stepping past it — a "boring" nameIdx like 0 or 1
 *   wouldn't collide with anything, and the buggy 1-byte-at-a-time walk
 *   would silently re-land on the right spot anyway (proving nothing).
 * - strIdx (query's string-pool index) is likewise set to 10 —
 *   OpCode.PUSH_NUMBER's value — so that if the first collision alone
 *   didn't already skip past CALL_PLUGIN, this second one compounds the
 *   drift far enough that it definitely does. That requires the string
 *   pool to have 10 filler entries ahead of the real query string.
 *
 * Verified by hand-tracing both scanners: pre-fix, this permanently skips
 * past the real CALL_PLUGIN (scanning only ever moves forward, so once
 * skipped it's never revisited) and preflight() incorrectly returns null;
 * post-fix, the scan lands exactly on it as intended.
 */
function buildQueryBytecodeAfterUserFunctionCall(query: string, fnIdx: number) {
  const strings = new Array(10).fill("_filler_");
  const strIdx = strings.length; // 10 — see comment above
  strings.push(query);

  const opcodes = new Uint8Array([
    OpCode.CALL_USER_FUNCTION, OpCode.CALL_BUILTIN, 1,
    OpCode.PUSH_STRING, strIdx,
    OpCode.CALL_PLUGIN, fnIdx, 1,
    OpCode.HALT,
  ]);

  return { opcodes, numbers: new Float64Array([]), strings, hasAsync: false };
}

describe("createQueryResolver", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    setActiveQueryClient(qc);
  });

  afterEach(() => {
    qc.clear();
  });

  test("preflight returns null when the query is already cached", () => {
    const { resolver } = createQueryResolver({
      namespace: "test-weather",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => stringValue("sunny"),
    });
    qc.setQueryData(["test-weather", "london"], stringValue("sunny"));

    const bytecode = buildQueryBytecode("london", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    expect(result).toBeNull();
  });

  test("preflight returns an AsyncCheckResult when the query is NOT cached, and it resolves to fetchQuery's value", async () => {
    const { resolver } = createQueryResolver({
      namespace: "test-weather",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async (query) => stringValue(`weather-for-${query}`),
    });

    const bytecode = buildQueryBytecode("paris", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    expect(result).not.toBeNull();
    const resolved = await result!.resolver;
    expect(resolved.type).toBe(ValueType.String);
    expect(resolved.value).toBe("weather-for-paris");
  });

  test("pluginFunction reads back the resolved value synchronously once cached", async () => {
    const { resolver, pluginFunction } = createQueryResolver({
      namespace: "test-stocks",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => uomValue(150.25, "USD"),
    });

    const bytecode = buildQueryBytecode("AAPL", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    await result!.resolver; // let TanStack Query populate the cache

    const readBack = pluginFunction([stringValue("AAPL")]);
    expect(readBack.type).toBe(ValueType.Uom);
    expect(readBack.toNumber()).toBeCloseTo(150.25);
    expect(readBack.unit).toBe("USD");
  });

  test("pluginFunction returns an honest error (not a guessed value) when nothing is cached yet", () => {
    const { pluginFunction } = createQueryResolver({
      namespace: "test-nothing-cached",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => numberValue(0),
    });
    const result = pluginFunction([stringValue("never-preflighted")]);
    expect(result.type).toBe(ValueType.Error);
  });

  test("a failed fetchQuery produces the default honest errorValue, not a silently-wrong fallback", async () => {
    const { resolver } = createQueryResolver({
      namespace: "test-failure",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => {
        throw new Error("API unreachable");
      },
      failureCooldownMs: 1, // avoid a long-lived timer outliving this test
    });

    const bytecode = buildQueryBytecode("tokyo", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    const resolved = await result!.resolver;
    expect(resolved.type).toBe(ValueType.Error);
    expect(resolved.value).toBe("TEST-FAILURE_QUERY_FAILED");
    expect(resolved.unit).toContain("API unreachable");
  });

  test("a custom onError override replaces the default errorValue fallback", async () => {
    const { resolver } = createQueryResolver({
      namespace: "test-custom-error",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => {
        throw new Error("boom");
      },
      onError: () => uomValue(0, "gp"), // OSRS-style graceful fallback instead of an Error value
      failureCooldownMs: 1, // avoid a long-lived timer outliving this test
    });

    const bytecode = buildQueryBytecode("dragon claw", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    const resolved = await result!.resolver;
    expect(resolved.type).toBe(ValueType.Uom);
    expect(resolved.toNumber()).toBe(0);
    expect(resolved.unit).toBe("gp");
  });

  test("preflight ignores CALL_PLUGIN calls for a different plugin function index", () => {
    const { resolver } = createQueryResolver({
      namespace: "test-scoped",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => stringValue("should not be called"),
    });

    const bytecode = buildQueryBytecode("query", TEST_FN_IDX + 1); // different fn index
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    expect(result).toBeNull();
  });

  test("respects a custom staleTimeMs / timeoutMs / failureCooldownMs without throwing", async () => {
    const { resolver } = createQueryResolver({
      namespace: "test-config",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async () => numberValue(42),
      staleTimeMs: 1000,
      timeoutMs: 500,
      failureCooldownMs: 100,
    });
    const bytecode = buildQueryBytecode("q", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    const resolved = await result!.resolver;
    expect(resolved.toNumber()).toBe(42);
  });

  test("preflight still detects CALL_PLUGIN after a CALL_USER_FUNCTION call (operand-width regression)", async () => {
    const { resolver } = createQueryResolver({
      namespace: "test-weather",
      pluginFunctionIndex: TEST_FN_IDX,
      fetchQuery: async (query) => stringValue(`weather-for-${query}`),
    });

    const bytecode = buildQueryBytecodeAfterUserFunctionCall("london", TEST_FN_IDX);
    const result = resolver.preflight!([], bytecode, "test-pkg", liveSignal(), qc);
    expect(result).not.toBeNull();
    const resolved = await result!.resolver;
    expect(resolved.value).toBe("weather-for-london");
  });
});
