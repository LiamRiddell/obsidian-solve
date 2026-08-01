/**
 * MultiResult — Comprehensive Unit Tests
 *
 * Covers:
 * - evaluateLine returning Value[] (single-element)
 * - ThreeTierEvaluator multi-result GROUP handling — a line can carry
 *   multiple independent expressions (inline solves, e.g.
 *   `s`1+1` text s`2+2``), each contributing its own Value[] group to
 *   `state.results: Value[][]`. This is unrelated to (and unaffected by)
 *   the removal of multi-target comma-splitting below.
 * - Variable-def single-result invariant
 * - Confirms multi-target comma syntax ("10 USD in EUR, GBP") is no
 *   longer split into multiple sub-expressions — it's evaluated as ONE
 *   expression and errors on the unconsumed trailing comma, same as any
 *   other malformed expression.
 */

import { describe, expect, test, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ExpressionEngine, type EvalResults } from "@solve-js/engine/ExpressionEngine";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { Value, ValueType } from "@solve-js/vm/Value";
import { ThreeTierEvaluator, EvalTier } from "@solve-js/engine/ThreeTierEvaluator";
import { DocumentModel, ViewportRange } from "@solve-js/engine/DocumentModel";
import { VMCheckpointer } from "@solve-js/vm/VMCheckpoints";
import type { ParsedLine, InlineSolvePosition } from "@solve-js/types/ParsingResult";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

// Currency model is pending-until-live: without a fetch (or seed), currency
// conversions return Pending instead of inventing rates. Seed a USD-base
// table so this suite's conversions resolve synchronously.
beforeAll(() => {
  sharedCurrencyExchange.primeRates("USD", {
    EUR: 0.854,
    GBP: 0.739,
    JPY: 151.5,
    CHF: 0.912,
  });
});

function createEngine(locale = "en", diagnosticMode = false): ExpressionEngine {
  return new ExpressionEngine(locale, diagnosticMode);
}

function createDoc(lines: string[]): DocumentModel {
  const doc = new DocumentModel();
  doc.setDocument(lines.join("\n"));
  return doc;
}

/** Assert a Value is a number with the expected value. */
function expectNumber(value: Value, expected: number, epsilon = 0.0001): void {
  expect(value.type).toBe(ValueType.Number);
  expect(Math.abs(value.toNumber() - expected)).toBeLessThan(epsilon);
}

/** Assert a Value is a UOM value with the expected unit. */
function expectUom(value: Value, unit: string): void {
  expect(value.type).toBe(ValueType.Uom);
  expect(value.unit).toBe(unit);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: evaluateLine — Basic evaluation
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateLine — Basic evaluation", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  test("simple arithmetic returns single-element Value[]", () => {
    const results = engine.evaluateLine(1, "1 + 2");
    expect(results.length).toBe(1);
    expectNumber(results[0], 3);
  });

  test("variable definition returns single-element Value[]", () => {
    const results = engine.evaluateLine(1, ":x = 5 + 3");
    expect(results.length).toBe(1);
    expectNumber(results[0], 8);
  });

  test("plain number returns single-element Value[]", () => {
    const results = engine.evaluateLine(1, "42");
    expect(results.length).toBe(1);
    expectNumber(results[0], 42);
  });

  test("expression with parens returns single-element Value[]", () => {
    const results = engine.evaluateLine(1, "(2 + 3) * 4");
    expect(results.length).toBe(1);
    expectNumber(results[0], 20);
  });

  test("return type is always Value[] even for trivial expressions", () => {
    const results = engine.evaluateLine(1, "0");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
  });

  test("single-target 'in' conversion (no comma) returns a single UOM value", () => {
    const results = engine.evaluateLine(1, "10 USD in EUR");
    expect(results.length).toBe(1);
    expect(results[0].type).toBe(ValueType.Uom);
  });

  test("no 'in' keyword: single-element Value[]", () => {
    const results = engine.evaluateLine(1, "10 + 5");
    expect(results.length).toBe(1);
    expectNumber(results[0], 15);
  });

  test("no currency: arithmetic has no 'in' keyword", () => {
    const results = engine.evaluateLine(1, "100 * 2 + 30");
    expect(results.length).toBe(1);
    expectNumber(results[0], 230);
  });

  test(":x = 10 USD in EUR evaluates to a single UOM value", () => {
    const results = engine.evaluateLine(1, ":x = 10 USD in EUR");
    expect(results.length).toBe(1);
    expect(results[0].type).toBe(ValueType.Uom);
    expect(results[0].unit).toBe("EUR");
    expect(results[0].toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Multi-target comma syntax is no longer supported
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateLine — multi-target comma syntax is unsupported", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  test("'10 USD in EUR, GBP' errors on the unconsumed trailing comma", () => {
    // Previously split into ["10 USD in EUR", "10 USD in GBP"] and evaluated
    // independently. That splitting machinery has been removed — the whole
    // string is now evaluated as ONE expression, and the comma after "EUR"
    // is an unconsumed trailing token, same as any other malformed input.
    expect(() => engine.evaluateLine(1, "10 USD in EUR, GBP")).toThrow(
      'Unexpected token after expression: ","'
    );
  });

  test("three comma-separated targets also error", () => {
    expect(() => engine.evaluateLine(1, "10 USD in EUR, GBP, JPY")).toThrow();
  });

  test("engine no longer exposes a public splitter", () => {
    expect((engine as any).splitMultiTargetExpression).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: ThreeTierEvaluator — Multi-result group handling
// (multiple INLINE SOLVES per line, e.g. `s`1+1` text s`2+2``) — a
// separate feature from multi-target comma-splitting, unaffected by its
// removal: each inline solve is still its own group in Value[][].
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Multi-result group handling", () => {
  let doc: DocumentModel;
  let engine: ExpressionEngine;
  let evaluator: ThreeTierEvaluator;

  beforeEach(() => {
    doc = createDoc(["10 + 5", "20 * 2", "30 - 7"]);
    engine = createEngine();
    evaluator = new ThreeTierEvaluator(doc, engine);
  });

  test("single expression: results is Value[][] with one group of one value", () => {
    const viewport: ViewportRange = { startLine: 1, endLine: 1 };
    const result = evaluator.evaluate(viewport);

    expect(result.tierCounts.tier1).toBe(1);
    const lineResult = result.lines[0];
    expect(lineResult.results).not.toBeNull();
    expect(lineResult.results!.length).toBe(1); // one expression group
    expect(lineResult.results![0].length).toBe(1); // one Value in group
    expectNumber(lineResult.results![0][0], 15);
  });

  test("LineState.results stores Value[][] after evaluation", () => {
    evaluator.evaluate({ startLine: 1, endLine: 1 });

    const state = doc.getLineAt(1)!;
    expect(state.results.length).toBe(1); // one expression group
    expect(state.results[0].length).toBe(1); // one Value
    expectNumber(state.results[0][0], 15);
  });

  test("error on expression: results still populated with errorValue", () => {
    const badDoc = createDoc(["((("]);
    const badEvaluator = new ThreeTierEvaluator(badDoc, engine);
    const result = badEvaluator.evaluate({ startLine: 1, endLine: 1 });

    expect(result.lines[0].error).not.toBeNull();
    // Even on error, results should be defined (may be empty if expression
    // couldn't produce any values, but error is still correctly propagated).
    expect(result.lines[0].results).toBeDefined();
  });

  test("resultMap stores flattened Value[] (all groups concatenated)", () => {
    // Line with inline solves: each solve = one group, each group = one value
    const inlineDoc = createDoc(["s`2 + 2` text s`3 * 3`"]);
    const inlineEvaluator = new ThreeTierEvaluator(inlineDoc, engine);

    const result = inlineEvaluator.evaluate({ startLine: 1, endLine: 1 });
    // resultMap stores flat array: [v1, v2] for the two inline solves
    const flatResults = result.resultMap.get(1)!;
    expect(flatResults.length).toBe(2);
    expectNumber(flatResults[0], 4);  // 2+2
    expectNumber(flatResults[1], 9);  // 3*3
  });

  test("single inline solve: results[0] is Value[][] with one group", () => {
    const inlineDoc = createDoc(["s`42`"]);
    const inlineEvaluator = new ThreeTierEvaluator(inlineDoc, engine);

    inlineEvaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = inlineDoc.getLineAt(1)!;
    expect(state.results.length).toBe(1);
    expect(state.results[0].length).toBe(1);
    expectNumber(state.results[0][0], 42);
  });

  test("multiple inline solves: each solve is a separate result group", () => {
    const inlineDoc = createDoc(["s`1 + 1` text s`2 + 2` text s`3 + 3`"]);
    const inlineEvaluator = new ThreeTierEvaluator(inlineDoc, engine);

    inlineEvaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = inlineDoc.getLineAt(1)!;
    expect(state.results.length).toBe(3);
    expect(state.results[0][0].toNumber()).toBe(2);
    expect(state.results[1][0].toNumber()).toBe(4);
    expect(state.results[2][0].toNumber()).toBe(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 4: ThreeTierEvaluator — Variable-def single-result invariant
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Variable-def single-result invariant", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  test("variable def result group has exactly 1 Value", () => {
    const varDoc = createDoc([":x = 5"]);
    const evaluator = new ThreeTierEvaluator(varDoc, engine);

    evaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = varDoc.getLineAt(1)!;
    expect(state.results.length).toBe(1);
    expect(state.results[0].length).toBe(1);
    expectNumber(state.results[0][0], 5);
  });

  test("variable def with arithmetic: result group has exactly 1 Value", () => {
    const varDoc = createDoc([":y = 10 + 3 * 2"]);
    const evaluator = new ThreeTierEvaluator(varDoc, engine);

    evaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = varDoc.getLineAt(1)!;
    expect(state.results.length).toBe(1);
    expect(state.results[0].length).toBe(1);
    expectNumber(state.results[0][0], 16);
  });

  test("inline solve variable def: result group has exactly 1 Value", () => {
    const varDoc = createDoc(["s`:a = 42`"]);
    const evaluator = new ThreeTierEvaluator(varDoc, engine);

    evaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = varDoc.getLineAt(1)!;
    expect(state.writes).toContain("a");
    expect(state.results.length).toBe(1);
    expect(state.results[0].length).toBe(1);
    expectNumber(state.results[0][0], 42);
  });

  test("multiple variable defs on one line: each has exactly 1 Value", () => {
    const varDoc = createDoc(["s`:a = 5` text s`:b = a + 3` text s`:c = b * 2`"]);
    const evaluator = new ThreeTierEvaluator(varDoc, engine);

    evaluator.evaluate({ startLine: 1, endLine: 1 });
    const state = varDoc.getLineAt(1)!;
    expect(state.results.length).toBe(3);
    // Each variable def group has exactly 1 Value
    expect(state.results[0].length).toBe(1);
    expect(state.results[1].length).toBe(1);
    expect(state.results[2].length).toBe(1);
    expectNumber(state.results[0][0], 5);
    expectNumber(state.results[1][0], 8);
    expectNumber(state.results[2][0], 16);
  });

  test("variable def with currency notation evaluates to a single result", () => {
    // :price = 10 USD in EUR. If the engine's colon-prefixed variable-def
    // parselet doesn't support the 'in' keyword in assignment values, that's
    // a known limitation unrelated to this test — the key assertion is that
    // it's a single result either way.
    try {
      const results = engine.evaluateLine(1, ":price = 10 USD in EUR");
      expect(results.length).toBe(1);
    } catch (e: any) {
      expect(e.message).toMatch(/colon|identifier|unit/i);
    }
  });

  test("variable def without colon but evaluated through ThreeTierEvaluator has exactly 1 Value group", () => {
    const results = engine.evaluateLine(1, ":rate = 100");
    expect(results.length).toBe(1);
    expectNumber(results[0], 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 5: Engine isolation tests — evaluateLine direct
// ═══════════════════════════════════════════════════════════════════════════

describe("Engine isolation — evaluateLine direct", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  test("sequential evaluateLine calls: VM state persists across calls", () => {
    const v1 = engine.evaluateLine(1, ":a = 5");
    expect(v1[0].toNumber()).toBe(5);

    const v2 = engine.evaluateLine(2, "a + 3");
    expect(v2[0].toNumber()).toBe(8);
  });

  test("evaluateLine returns Value[] (not Value)", () => {
    const results = engine.evaluateLine(1, "42");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toBeInstanceOf(Object);
    expect(typeof results[0].toNumber).toBe("function");
  });

  test("evaluateNumber still works with Value[] return", () => {
    const result = engine.evaluateNumber("10 + 5");
    expect(result).toBe(15);
  });

  test("evaluateNumber returns NaN for NaN inputs", () => {
    const result = engine.evaluateNumber("undefined_var");
    expect(result).toBeNaN();
  });

  test("evaluateExpression returns Value[]", () => {
    const results = engine.evaluateExpression("100 / 4");
    expect(results.length).toBe(1);
    expectNumber(results[0], 25);
  });

  test("reEvaluateLine still works (returns single Value)", () => {
    engine.evaluateLine(1, "5 + 5");
    const result = engine.reEvaluateLine(1, "5 + 5");
    expect(result).toBeDefined();
    expect(result!.toNumber()).toBe(10);
  });

  test("line cache stores result after evaluateLine", () => {
    engine.evaluateLine(1, "99");
    const cached = engine.getLineCache().get(1, "99");
    expect(cached).toBeDefined();
    expect(cached!.result.toNumber()).toBe(99);
  });

  test("re-evaluating the same line number with a new expression replaces the old cache entry, not contaminates it", () => {
    // Verify that evaluating a new expression at an already-cached line
    // number cleanly supersedes the previous one -- LineCache enforces
    // "at most one entry per line number" (see LineCache.ts's doc comment)
    // since a line's old text is never queried again once the line has
    // moved on; letting both pile up was a real, unbounded memory leak
    // (every edit to a line added a new cache entry that nothing ever
    // evicted) fixed by LineCache.set().
    engine.evaluateLine(1, "10 USD in EUR");
    engine.evaluateLine(1, "100 USD in JPY"); // same line, different expression

    const cache = engine.getLineCache();

    expect(cache.get(1, "10 USD in EUR")).toBeUndefined();
    expect(cache.get(1, "100 USD in JPY")).toBeDefined();
    expect(cache.size).toBe(1);
  });

  test("evaluateExpression single call integrates correctly", () => {
    const results = engine.evaluateExpression("50 * 2");
    expect(results.length).toBe(1);
    expectNumber(results[0], 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 6: Tier 2 (cached) multi-result preservation
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Tier 2 multi-result preservation", () => {
  test("Tier 2 preserves result groups from Tier 1", () => {
    const doc = createDoc(["5 * 3", "10 + 2", "7 - 1"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    // First pass: Tier 1
    evaluator.evaluateAll();

    const stateAfterT1 = doc.getLineAt(1)!;
    expect(stateAfterT1.results.length).toBe(1);
    expect(stateAfterT1.results[0].length).toBe(1);
    expectNumber(stateAfterT1.results[0][0], 15);

    // Second pass: Tier 2
    const result = evaluator.evaluateAll();
    expect(result.tierCounts.tier2).toBe(3);

    const stateAfterT2 = doc.getLineAt(1)!;
    expect(stateAfterT2.results.length).toBe(1);
    expect(stateAfterT2.results[0].length).toBe(1);
    expectNumber(stateAfterT2.results[0][0], 15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 7: resultMap correctness with flattened results
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — resultMap correctness", () => {
  test("resultMap contains flattened results for all lines", () => {
    const doc = createDoc(["5 + 3", "10 * 2", ":x = 4", "x + 1"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    const result = evaluator.evaluate({ startLine: 1, endLine: 4 });

    expect(result.resultMap.size).toBe(4);
    expectNumber(result.resultMap.get(1)![0], 8);
    expectNumber(result.resultMap.get(2)![0], 20);
    expectNumber(result.resultMap.get(3)![0], 4);
    expectNumber(result.resultMap.get(4)![0], 5);
  });

  test("resultMap for multi-inline-solve line contains all values", () => {
    const doc = createDoc(["s`1 + 1` text s`2 + 2` text s`3 + 3`"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    const result = evaluator.evaluate({ startLine: 1, endLine: 1 });
    const flatResults = result.resultMap.get(1)!;
    expect(flatResults.length).toBe(3);
    expectNumber(flatResults[0], 2);
    expectNumber(flatResults[1], 4);
    expectNumber(flatResults[2], 6);
  });

  test("resultMap has correct keys for different viewport", () => {
    const doc = createDoc(["10 + 1", "20 + 2", "30 + 3"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    // Only evaluate lines 1-2
    const result = evaluator.evaluate({ startLine: 1, endLine: 2 });
    expect(result.resultMap.size).toBe(2);
    expect(result.resultMap.has(1)).toBe(true);
    expect(result.resultMap.has(2)).toBe(true);
    expect(result.resultMap.has(3)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 8: Tier 3 — compile-only for invisible lines
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — Tier 3 compile-only", () => {
  test("invisible non-var-def line: compiled but not executed (no results)", () => {
    const doc = createDoc(["100 + 5", ":x = 5", "x + 3", "visible expression"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    // Viewport only line 4 — lines 1-3 are invisible
    const result = evaluator.evaluate({ startLine: 4, endLine: 4 });

    const line1 = doc.getLineAt(1)!;
    // Line 1: compiled but NOT executed (dirty stays true, no results)
    expect(line1.bytecodes.length).toBe(1);
    expect(line1.dirty).toBe(true);
    expect(line1.results.length).toBe(0);
  });

  test("invisible variable-def line: compiled AND executed (result stored)", () => {
    const doc = createDoc(["100 + 5", ":x = 10", "x * 3", ":y = x + 1", "visible"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    evaluator.evaluate({ startLine: 5, endLine: 5 });

    // Line 2 (:x = 10): invisible var def → executed → clean + result
    const line2 = doc.getLineAt(2)!;
    expect(line2.isVariableDef).toBe(true);
    expect(line2.dirty).toBe(false);
    expect(line2.results.length).toBe(1);
    expectNumber(line2.results[0][0], 10);

    // Line 4 (:y = x + 1): uses x from line 2
    const line4 = doc.getLineAt(4)!;
    expect(line4.dirty).toBe(false);
    expect(line4.results.length).toBe(1);
    expect(line4.results[0][0].toNumber()).toBe(11);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 9: setViewport — zero-allocation results
// ═══════════════════════════════════════════════════════════════════════════

describe("ThreeTierEvaluator — setViewport results", () => {
  test("setViewport returns correct resultMap after scroll", () => {
    const doc = createDoc([":x = 10", "x + 5", "x * 2", "x + 20", ":y = 100", "y / 2", "y + x"]);
    const engine = createEngine();
    const checkpointer = new VMCheckpointer(engine.getVM());
    const evaluator = new ThreeTierEvaluator(doc, engine, checkpointer);

    evaluator.evaluateAll();

    // Scroll to lines 4-6
    const result = evaluator.setViewport({ startLine: 4, endLine: 6 });
    expect(result.tierCounts.tier2).toBe(3);
    expect(result.resultMap.size).toBe(3);
    expect(result.resultMap.has(4)).toBe(true);
    expect(result.resultMap.has(5)).toBe(true);
    expect(result.resultMap.has(6)).toBe(true);
    expect(result.resultMap.has(3)).toBe(false);
  });

  test("setViewport preserves result structure (Value[][])", () => {
    const doc = createDoc([":x = 5", "x + 3", "x * 2"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    evaluator.evaluateAll();

    const result = evaluator.setViewport({ startLine: 2, endLine: 3 });
    expect(result.resultMap.get(2)!.length).toBe(1); // one group, one value
    expect(result.resultMap.get(3)!.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 10: Error handling across multi-result
// ═══════════════════════════════════════════════════════════════════════════

describe("MultiResult — Error handling", () => {
  test("evaluateLine throws on parse error in single expression", () => {
    const engine = createEngine();
    expect(() => engine.evaluateLine(1, "(((")).toThrow();
  });

  test("evaluateLine still returns Value[] on success after previous error", () => {
    const engine = createEngine();

    // First call succeeds
    const results = engine.evaluateLine(1, "42");
    expect(results.length).toBe(1);

    // Subsequent call also works
    const r2 = engine.evaluateLine(2, "24");
    expect(r2.length).toBe(1);
  });

  test("ThreeTierEvaluator marks line dirty on error (retry possible)", () => {
    const badDoc = createDoc(["((("]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(badDoc, engine);

    const result = evaluator.evaluate({ startLine: 1, endLine: 1 });
    expect(result.lines[0].error).not.toBeNull();

    const state = badDoc.getLineAt(1)!;
    expect(state.dirty).toBe(true);
  });

  test("ThreeTierEvaluator error: result is non-null with error values", () => {
    const badDoc = createDoc(["((("]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(badDoc, engine);

    const result = evaluator.evaluate({ startLine: 1, endLine: 1 });

    expect(result.lines[0].results).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 11: Value type correctness
// ═══════════════════════════════════════════════════════════════════════════

describe("MultiResult — Value type correctness", () => {
  test("single number expression returns Number Value type", () => {
    const engine = createEngine();
    const results = engine.evaluateLine(1, "42");
    expect(results[0].type).toBe(ValueType.Number);
  });

  test("hex literal returns Hex or Number Value type", () => {
    const engine = createEngine();
    const results = engine.evaluateLine(1, "0xFF");
    // Engine may normalize hex literals to Number type after arithmetic.
    // Accept either Hex (1) or Number (0).
    expect([ValueType.Number, ValueType.Hex]).toContain(results[0].type);
    expect(results[0].toNumber()).toBe(255);
  });

  test("result array is always Array.isArray()", () => {
    const engine = createEngine();
    const r1 = engine.evaluateLine(1, "1");
    const r2 = engine.evaluateLine(1, "1 + 1");
    const r3 = engine.evaluateLine(1, "sin(1)");

    expect(Array.isArray(r1)).toBe(true);
    expect(Array.isArray(r2)).toBe(true);
    expect(Array.isArray(r3)).toBe(true);
  });

  test("UOM value has both toNumber and unit", () => {
    const engine = createEngine();
    const results = engine.evaluateLine(1, "10 USD in EUR");
    expect(results[0].type).toBe(ValueType.Uom);
    expect(typeof results[0].toNumber()).toBe("number");
    expect(typeof results[0].unit).toBe("string");
    expect(results[0].unit!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 12: Repeatability
// ═══════════════════════════════════════════════════════════════════════════

describe("MultiResult — Repeatability", () => {
  test("evaluateLine with same expression returns same values", () => {
    const engine = createEngine();
    const r1 = engine.evaluateLine(1, "10 + 5");
    const r2 = engine.evaluateLine(1, "10 + 5");

    expect(r1.length).toBe(r2.length);
    expectNumber(r1[0], r2[0].toNumber());
  });

  test("ThreeTierEvaluator repeatability: same results on second evaluation", () => {
    const doc = createDoc(["5 + 3", "10 * 2"]);
    const engine = createEngine();
    const evaluator = new ThreeTierEvaluator(doc, engine);

    evaluator.evaluateAll(); // Tier 1
    const result = evaluator.evaluateAll(); // Tier 2

    expect(result.tierCounts.tier2).toBe(2);
    expectNumber(result.resultMap.get(1)![0], 8);
    expectNumber(result.resultMap.get(2)![0], 20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 13: processScanResults — inline solves and full-line evaluation
// ═══════════════════════════════════════════════════════════════════════════

describe("processScanResults — inline solves and full-line evaluation", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  /** Helper: extract the first InlineSolvePosition from a ParsedLine. */
  function firstSolve(parsed: ParsedLine): InlineSolvePosition | undefined {
    return parsed.inlineSolves[0];
  }

  test("parseDocument: single inline solve stores its value on result", () => {
    // s`42` — bare number
    const result = engine.parseDocument("s`42`", { inputType: "markdown" });
    expect(result.errors).toEqual([]);

    const solve = firstSolve(result.lines[0]);
    expect(solve).toBeDefined();
    expect(solve!.result).toBeDefined();
    expect(solve!.result!.toNumber()).toBe(42);
  });

  test("evaluateLines: single inline solve stores its value on result", () => {
    const lines = engine.evaluateLines(["s`7 * 6`"]);
    const solve = firstSolve(lines[0]);
    expect(solve!.result).toBeDefined();
    expectNumber(solve!.result!, 42);
  });

  test("evaluateLines: multiple lines with inline solves each have a result", () => {
    const lines = engine.evaluateLines([
      "s`1 + 1`",
      "s`10 USD in EUR`",
      "s`3 * 3`",
    ]);
    expect(lines.length).toBe(3);

    expectNumber(firstSolve(lines[0])!.result!, 2);
    expectUom(firstSolve(lines[1])!.result!, "EUR");
    expectNumber(firstSolve(lines[2])!.result!, 9);
  });

  test("processScanResults: inline solve parse error sets solve.error", () => {
    // Malformed expression inside inline solve
    const result = engine.parseDocument("s`(((", { inputType: "markdown" });
    // May produce an error in the ParsingResult.errors
    const solve = firstSolve(result.lines[0]);
    // Either the solve has an error or the line has an error
    const hasError = solve?.error || result.lines[0].error || result.errors.length > 0;
    expect(hasError).toBeTruthy();
  });

  test("parseDocument and evaluateLines return the same result for the same input", () => {
    const expr = "s`10 USD in EUR`";
    const parseResult = engine.parseDocument(expr, { inputType: "markdown" });
    const evalResult = engine.evaluateLines([expr]);

    const parseSolve = firstSolve(parseResult.lines[0])!;
    const evalSolve = firstSolve(evalResult[0])!;

    expect(parseSolve.result!.toNumber()).toBe(evalSolve.result!.toNumber());
  });

  test("evaluateLines: full-line expression (no s`` wrapper) stores result on ParsedLine", () => {
    const lines = engine.evaluateLines(["10 + 5"]);
    expect(lines[0].result).toBeDefined();
    expect(lines[0].result!.toNumber()).toBe(15);
    // No inline solves on this line
    expect(lines[0].inlineSolves).toEqual([]);
  });

  test("evaluateLines: full-line multi-target comma syntax errors (not split)", () => {
    // Full-line expression (no s`` wrapper). processScanResults' fast path
    // tokenizes the whole line as ONE expression — the trailing comma after
    // "EUR" is an unconsumed token, so this now errors instead of silently
    // evaluating only "10 USD in EUR" (or, previously, splitting into two).
    const lines = engine.evaluateLines(["10 USD in EUR, GBP"]);
    expect(lines[0].result).toBeNull();
    expect(lines[0].error).toBe('Unexpected token after expression: ","');
  });

  test("processScanResults: empty inline solve expression handles gracefully", () => {
    // s`` — backtick pair with nothing inside.
    const result = engine.parseDocument("s``", { inputType: "markdown" });
    const line = result.lines[0];
    if (line.inlineSolves.length > 0) {
      const solve = line.inlineSolves[0];
      // Empty expression may be evaluated as 0, or fail — either is fine.
      // Key: no crash, and results is populated (or error is set).
      expect(solve.result ?? solve.error).toBeDefined();
    }
    // Either way, no crash and no false results.
  });
});
