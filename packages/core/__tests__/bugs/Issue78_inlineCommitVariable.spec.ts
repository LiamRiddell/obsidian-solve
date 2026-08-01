import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #78: Committing Inline w/ Variable Fails", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
  });

  test("inline solve with pre-defined variable resolves correctly", () => {
    // Define a variable first via regular line
    engine.evaluateLine(1, ":x = 10");

    // Use it in an inline solve
    const [result] = engine.evaluateLine(2, "s`x + 5`");
    expect(result.toNumber()).toBe(15);
  });

  test("inline solve with variable updates after variable changes", () => {
    engine.evaluateLine(1, ":x = 10");
    engine.evaluateLine(2, "s`x + 5`");

    // Change x
    engine.evaluateLine(1, ":x = 20");

    // The inline solve should reflect the updated value when re-evaluated
    const [result] = engine.evaluateLine(2, "s`x + 5`");
    expect(result.toNumber()).toBe(25);
  });

  test("inline solve without variable commits correctly", () => {
    // Baseline: inline solve without variables should work
    const [result] = engine.evaluateLine(1, "s`10 + 20`");
    expect(result.toNumber()).toBe(30);
  });

  test("multiple inline solves referencing same variable", () => {
    engine.evaluateLine(1, ":x = 3");

    const [r1] = engine.evaluateLine(2, "s`x + 1`");
    const [r2] = engine.evaluateLine(3, "s`x * 2`");
    const [r3] = engine.evaluateLine(4, "s`x ^ 2`");

    expect(r1.toNumber()).toBe(4);
    expect(r2.toNumber()).toBe(6);
    expect(r3.toNumber()).toBe(9);
  });

  test("inline solve variable dependency tracked in DAG", () => {
    engine.evaluateLine(1, ":myvar = 42");
    engine.evaluateLine(2, "s`myvar + 8`");

    const dag = engine.getDag();
    const affected = dag.getAffectedLines("myvar");
    expect(affected.size).toBeGreaterThan(0);
    expect(affected).toContain(2);
  });

  test("complex inline expression with function and variable", () => {
    engine.evaluateLine(1, ":radius = 5");
    const [result] = engine.evaluateLine(2, "s`round(pi * :radius ^ 2)`");
    expect(result.toNumber()).toBeCloseTo(79, 0);
  });

  test("clearing engine state allows fresh variable evaluation", () => {
    engine.evaluateLine(1, ":x = 10");
    engine.evaluateLine(2, "s`x + 5`");

    // Clear all state
    engine.clear();

    // Should be able to redefine and evaluate after clear
    engine.evaluateLine(1, ":x = 100");
    const [result] = engine.evaluateLine(2, "s`x + 5`");
    expect(result.toNumber()).toBe(105);
  });
});