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

  describe("data-source dependency tracking", () => {
    test("registerLineDataSourceDependency makes a line findable via getAffectedLinesByDataSource", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      const affected = dag.getAffectedLinesByDataSource("currency", ["USD", "EUR"]);
      expect(affected.has(10)).toBe(true);
    });

    test("removeLine cleans up this line's data-source consumer entries", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      dag.removeLine(10);
      const affected = dag.getAffectedLinesByDataSource("currency", ["USD", "EUR"]);
      expect(affected.has(10)).toBe(false);
      expect(affected.size).toBe(0);
    });

    test("removeLine only touches the removed line's OWN data-source keys — other lines on the same key survive", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      dag.registerLineDataSourceDependency(20, "currency", ["USD", "EUR"]);
      dag.removeLine(10);
      const affected = dag.getAffectedLinesByDataSource("currency", ["USD", "EUR"]);
      expect(affected.has(10)).toBe(false);
      expect(affected.has(20)).toBe(true);
    });

    test("removeLine only touches the removed line's OWN data-source keys — unrelated keys elsewhere in the document survive", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      dag.registerLineDataSourceDependency(20, "osrs-ge", ["Iron Axe"]);
      dag.removeLine(10);
      expect(dag.getAffectedLinesByDataSource("osrs-ge", ["Iron Axe"]).has(20)).toBe(true);
    });

    test("removeLine on a line with multiple data-source dependencies cleans up all of them", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      dag.registerLineDataSourceDependency(10, "osrs-ge", ["Iron Axe"]);
      dag.removeLine(10);
      expect(dag.getAffectedLinesByDataSource("currency", ["USD", "EUR"]).has(10)).toBe(false);
      expect(dag.getAffectedLinesByDataSource("osrs-ge", ["Iron Axe"]).has(10)).toBe(false);
    });

    test("removeLine on a line with no data-source dependencies is a safe no-op for this cleanup", () => {
      const dag = new DependencyGraph();
      dag.registerLine(10, ["x"], []);
      expect(() => dag.removeLine(10)).not.toThrow();
    });

    test("getSnapshot reflects data-source state and removeLine's cleanup of it", () => {
      const dag = new DependencyGraph();
      dag.registerLineDataSourceDependency(10, "currency", ["USD", "EUR"]);
      const before = dag.getSnapshot();
      expect(before.dataSourceDeps[10]).toEqual(["currency:[\"USD\",\"EUR\"]"]);
      expect(before.dataSourceConsumers["currency:[\"USD\",\"EUR\"]"]).toEqual([10]);

      dag.removeLine(10);
      const after = dag.getSnapshot();
      expect(after.dataSourceDeps[10]).toBeUndefined();
      expect(after.dataSourceConsumers["currency:[\"USD\",\"EUR\"]"]).toEqual([]);
    });
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

describe("DependencyGraph.getAffectedLinesInOrder — Phase 1.4 topological sort", () => {
  test("chain: x→y→z returns consumers in topological order", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["x"]);     // defines x
    dag.registerLine(20, ["x"], ["y"]);  // y = f(x)
    dag.registerLine(30, ["y"], ["z"]);  // z = f(y)
    const ordered = dag.getAffectedLinesInOrder("x");
    // y (20) must come before z (30) — z reads y which 20 writes
    expect(ordered.indexOf(20)).toBeLessThan(ordered.indexOf(30));
    expect(ordered).toHaveLength(2);
  });

  test("non-ascending document order: consumers defined after producers regardless of line numbers", () => {
    // Line 1 reads y (defined on line 2), then reads x (changed variable)
    const dag = new DependencyGraph();
    dag.registerLine(1, ["y"], ["z"]);   // z = f(y) — consumer, after y
    dag.registerLine(2, ["x"], ["y"]);   // y = f(x) — producer, before z
    const ordered = dag.getAffectedLinesInOrder("x");
    // y (line 2) must come before z (line 1)
    expect(ordered.indexOf(2)).toBeLessThan(ordered.indexOf(1));
    expect(ordered).toHaveLength(2);
  });

  test("diamond DAG: x→a, x→b, a+b→c", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["x"]);       // x = ...
    dag.registerLine(20, ["x"], ["a"]);    // a = f(x)
    dag.registerLine(30, ["x"], ["b"]);    // b = f(x)
    dag.registerLine(40, ["a", "b"], ["c"]); // c = f(a, b)
    const ordered = dag.getAffectedLinesInOrder("x");
    // c must come after both a and b (the producers it depends on)
    expect(ordered).toHaveLength(3);
    expect(ordered).toContain(20);
    expect(ordered).toContain(30);
    expect(ordered).toContain(40);
    // c is last since it depends on both a and b
    expect(ordered.indexOf(40)).toBeGreaterThan(ordered.indexOf(20));
    expect(ordered.indexOf(40)).toBeGreaterThan(ordered.indexOf(30));
  });

  test("unknown variable returns empty array", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], []);
    const ordered = dag.getAffectedLinesInOrder("nonexistent");
    expect(ordered).toEqual([]);
  });

  test("single affected line", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["x"]);
    dag.registerLine(20, ["x"], []);
    const ordered = dag.getAffectedLinesInOrder("x");
    expect(ordered).toEqual([20]);
  });

  test("multiple independent consumers: both depend on x but not each other", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, [], ["x"]);
    dag.registerLine(20, ["x"], []);  // reads x, no writes
    dag.registerLine(30, ["x"], []);  // reads x, no writes
    const ordered = dag.getAffectedLinesInOrder("x");
    expect(ordered).toContain(20);
    expect(ordered).toContain(30);
    expect(ordered).toHaveLength(2);
  });

  test("self-referencing writes are excluded from affected set by design", () => {
    // Line redefines itself: :x = :x + 1
    // registerLine removes consumer references when a line writes the
    // same variable it reads (prevents self-loops in the DAG). This
    // means the line won't appear in affected lines for "x" — it's
    // treated as a pure producer, not a consumer of x.
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], ["x"]);
    // Line 10 is a consumer of x via reads, but the write to x removes
    // that consumer edge. So getAffectedLines("x") won't include 10.
    const affected = dag.getAffectedLines("x");
    expect(affected.has(10)).toBe(false);
    const ordered = dag.getAffectedLinesInOrder("x");
    expect(ordered).toEqual([]);
  });
});
