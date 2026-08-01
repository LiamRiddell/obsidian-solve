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
});
