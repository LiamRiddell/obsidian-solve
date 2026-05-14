import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@/engine/engine/ExpressionEngine";
import { numberValue } from "@/engine/vm/Value";

describe("ExpressionEngine", () => {
  test("evaluateLine returns correct value for simple arithmetic", () => {
    const engine = new ExpressionEngine();
    const result = engine.evaluateLine(1, "1 + 2");
    expect(result.toNumber()).toBe(3);
  });

  test("evaluateLine caches bytecode and result", () => {
    const engine = new ExpressionEngine();
    const result = engine.evaluateLine(1, "42");
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
    const v = engine.evaluateLine(10, ":myVar = 5 + 3");
    expect(v.toNumber()).toBe(8);
  });
});