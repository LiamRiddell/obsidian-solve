import { describe, expect, test } from "@jest/globals";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";

describe("DependencyGraph", () => {
  test("registerLine records consumer relationships", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], []);
    dag.registerLine(20, ["x"], []);
    const affected = dag.getAffectedLines("x");
    expect(affected.has(10)).toBe(true);
    expect(affected.has(20)).toBe(true);
  });

  test("getAffectedLines returns empty set for unknown variable", () => {
    const dag = new DependencyGraph();
    const affected = dag.getAffectedLines("nonexistent");
    expect(affected.size).toBe(0);
  });

  test("transitive propagation: x changed -> line 20 writes y -> line 30 reads y", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["x"]);
    dag.registerLine(20, ["x"], ["y"]);
    dag.registerLine(30, ["y"], []);
    const affected = dag.getAffectedLines("x");
    expect(affected.has(20)).toBe(true);
    expect(affected.has(30)).toBe(true);
  });

  test("writes do not add self-loops", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], ["x"]);
    const consumers = dag.getConsumers("x");
    expect(consumers.has(10)).toBe(false);
  });

  test("removeLine cleans up all edges", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], []);
    dag.registerLine(20, ["x"], []);
    dag.removeLine(10);
    const affected = dag.getAffectedLines("x");
    expect(affected.has(10)).toBe(false);
    expect(affected.has(20)).toBe(true);
  });

  test("getDependencies returns read variables for a line", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["a", "b"], ["c"]);
    const deps = dag.getDependencies(10);
    expect(deps.has("a")).toBe(true);
    expect(deps.has("b")).toBe(true);
    expect(deps.has("c")).toBe(false);
  });

  test("clear resets all state", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], []);
    dag.clear();
    expect(dag.getAffectedLines("x").size).toBe(0);
  });

  test("multiple changes propagate transitively", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["a"]);
    dag.registerLine(20, ["a"], ["b"]);
    dag.registerLine(30, ["b"], ["c"]);
    dag.registerLine(40, ["c"], []);
    const affected = dag.getAffectedLines("a");
    expect(affected.has(20)).toBe(true);
    expect(affected.has(30)).toBe(true);
    expect(affected.has(40)).toBe(true);
  });

  test("no false transitive when consumer does not write", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["a"]);
    dag.registerLine(20, ["a"], []);
    dag.registerLine(30, ["b"], []);
    const affected = dag.getAffectedLines("a");
    expect(affected.has(20)).toBe(true);
    expect(affected.has(30)).toBe(false);
  });

  test("DAG build handles empty reads and writes", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], []);
    dag.registerLine(20, [], []);
    const affected = dag.getAffectedLines("x");
    expect(affected.size).toBe(0);
  });
});
