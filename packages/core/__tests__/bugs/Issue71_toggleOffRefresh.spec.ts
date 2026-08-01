import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #71: Toggle Off Refresh", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("clear() removes all cached state and allows fresh evaluation", () => {
    engine.evaluateLine(1, ":x = 10");
    engine.evaluateLine(2, "s`x + 5`");

    const entryBefore = engine.getLineCache().getEntryForLine(2);
    expect(entryBefore).toBeDefined();

    engine.clear();

    const entryAfter = engine.getLineCache().getEntryForLine(1);
    expect(entryAfter).toBeUndefined();

    engine.evaluateLine(1, ":x = 20");
    const [result] = engine.evaluateLine(2, "s`x + 5`");
    expect(result.toNumber()).toBe(25);
  });

  test("clear() resets the DAG", () => {
    engine.evaluateLine(1, ":x = 5");
    engine.evaluateLine(2, "s`x + 1`");

    const dag = engine.getDag();
    expect(dag.getAffectedLines("x").size).toBeGreaterThan(0);

    engine.clear();

    expect(dag.getAffectedLines("x").size).toBe(0);
  });

  test("clear() resets the scope manager", () => {
    engine.evaluateLine(1, ":myvar = 42");
    expect(engine.evaluateNumber("myvar")).toBe(42);

    engine.clear();

    expect(engine.evaluateNumber("myvar")).toBeNaN();
  });

  test("re-evaluation after clear produces correct results", () => {
    engine.evaluateLine(1, ":val1 = 10");
    engine.evaluateLine(2, ":val2 = 20");
    engine.evaluateLine(3, "s`val1 + val2`");

    engine.clear();

    engine.evaluateLine(1, ":val1 = 100");
    engine.evaluateLine(2, ":val2 = 200");
    engine.evaluateLine(3, "s`val1 + val2`");

    const [result] = engine.evaluateLine(3, "s`val1 + val2`");
    expect(result.toNumber()).toBe(300);
  });
});