/**
 * ExpressionEngine — Core Unit Tests
 *
 * Tests the engine's fundamental API:
 * - evaluateLine / reEvaluateLine
 * - Bytecode caching via LineCache
 * - DAG tracking for variable assignments
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";


describe("ExpressionEngine", () => {
  test("evaluateLine returns correct value for simple arithmetic", () => {
    const engine = new ExpressionEngine();
    const [result] = engine.evaluateLine(1, "1 + 2");
    expect(result.toNumber()).toBe(3);
  });

  test("evaluateLine caches bytecode and result", () => {
    const engine = new ExpressionEngine();
    const [result] = engine.evaluateLine(1, "42");
    expect(result.toNumber()).toBe(42);

    const cached = engine.getLineCache().get(1, "42");
    expect(cached).toBeDefined();
    expect(cached!.result.toNumber()).toBe(42);
  });

  test("reEvaluateLine re-executes cached bytecode", () => {
    const engine = new ExpressionEngine();
    engine.evaluateLine(1, "5 + 5");
    const result = engine.reEvaluateLine(1, "5 + 5");
    expect(result!.toNumber()).toBe(10);
  });

  test("DAG tracks variable assignments in expression engine", () => {
    const engine = new ExpressionEngine();
    const [v] = engine.evaluateLine(10, ":myVar = 5 + 3");
    expect(v.toNumber()).toBe(8);
  });

  // ── Error-quality regression (Phase 2 of the error-handling pass) ──
  //
  // evaluateLine()/evaluateWithTokens() used to catch whatever EngineError
  // parseExpression() threw and discard it down to just its `.message`,
  // then reconstruct a brand-new, generic "EVALUATION_ERROR" wrapper around
  // that string — losing the original, specific code and any
  // expected/found/suggestion detail the actual parselet attached. Now the
  // original error is re-thrown as-is.

  test("a parse-time error surfaces its original specific code, not a generic EVALUATION_ERROR wrapper", () => {
    const engine = new ExpressionEngine();
    // ClampParselet.ts throws CLAMP_EXPECTED_BETWEEN_OR_FROM when neither
    // "between" nor "from" follows "clamp <value>".
    expect.assertions(2);
    try {
      engine.evaluateLine(1, "clamp 5 10");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("CLAMP_EXPECTED_BETWEEN_OR_FROM");
      expect((e as { code?: string }).code).not.toBe("EVALUATION_ERROR");
    }
  });

  test("compileExpression() surfaces the same original specific code as evaluateLine()", () => {
    const engine = new ExpressionEngine();
    expect.assertions(2);
    try {
      engine.compileExpression("clamp 5 10");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("CLAMP_EXPECTED_BETWEEN_OR_FROM");
      expect((e as { code?: string }).code).not.toBe("PARSE_ERROR");
    }
  });

  test("compileExpression() still attaches reads/writes context on a parse failure that has them", () => {
    const engine = new ExpressionEngine();
    expect.assertions(2);
    try {
      // ":x = clamp 5 10" — a variable-write line whose RHS fails to parse.
      // reads/writes are extracted from the full token list independent of
      // parse success, so DAG-registering callers should still see them.
      engine.compileExpression(":x = clamp 5 10");
    } catch (e) {
      const err = e as { code?: string; context?: { reads?: string[]; writes?: string[] } };
      expect(err.code).toBe("CLAMP_EXPECTED_BETWEEN_OR_FROM");
      expect(err.context?.writes).toEqual(["x"]);
    }
  });
});
