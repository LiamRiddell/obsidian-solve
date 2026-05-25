import { describe, expect, test } from "@jest/globals";
import { DependencyGraph } from "@solve-js/vm/DependencyGraph";
import { DynamicValueResolver } from "@solve-js/engine/DynamicValueResolver";
import type { IDynamicDataSource } from "@solve-js/engine/IDynamicDataSource";

describe("DynamicValueResolver", () => {
  test("enqueue and flush batch merges affected lines", () => {
    const dag = new DependencyGraph();

    dag.registerLine(10, ["x"], ["y"]);
    dag.registerLine(20, ["x"], []);
    dag.registerLine(30, ["y"], []);

    let batchLines: Set<number> = new Set();
    const resolver = new DynamicValueResolver(
      dag,
      (lines) => { batchLines = lines; },
      10
    );

    resolver["enqueueUpdate"]("x", 5);
    resolver.flushBatch();

    expect(batchLines.has(10)).toBe(true);
    expect(batchLines.has(20)).toBe(true);
    expect(batchLines.size).toBe(3);
  });

  test("multiple updates to same variable merged into one batch", () => {
    const dag = new DependencyGraph();
    dag.registerLine(10, ["x"], []);

    let callCount = 0;
    const resolver = new DynamicValueResolver(
      dag,
      () => { callCount++; },
      20
    );

    resolver["enqueueUpdate"]("x", 1);
    resolver["enqueueUpdate"]("x", 2);
    resolver["enqueueUpdate"]("x", 3);
    resolver.flushBatch();

    expect(callCount).toBe(1);
  });

  test("pause prevents fetch during polling", () => {
    const dag = new DependencyGraph();

    let fetchCount = 0;
    const source: IDynamicDataSource = {
      name: "test",
      refreshIntervalMs: 10,
      async fetch() { fetchCount++; return 42; },
    };

    const resolver = new DynamicValueResolver(dag, () => {}, 50);
    resolver.registerSource(source);
    resolver.pause();
    resolver.subscribe("sym", "test");

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolver.clear();
        expect(fetchCount).toBe(0);
        resolve();
      }, 30);
    });
  }, 5000);

  test("flushBatch invokes callback with merged affected lines", () => {
    const dag = new DependencyGraph();

    dag.registerLine(10, ["x"], []);

    let receivedLines: Set<number> = new Set();
    const resolver = new DynamicValueResolver(dag, (lines) => { receivedLines = lines; }, 10);
    resolver["enqueueUpdate"]("x", 99);
    resolver.flushBatch();

    // The callback should receive the affected lines (dirty state now in DocumentModel)
    expect(receivedLines.has(10)).toBe(true);
  });

  test("clear stops all timers and resets state", () => {
    const dag = new DependencyGraph();
    const resolver = new DynamicValueResolver(dag, () => {}, 10);

    const source: IDynamicDataSource = {
      name: "test",
      refreshIntervalMs: 10,
      async fetch() { return 1; },
    };

    resolver.registerSource(source);
    resolver.subscribe("sym", "test");
    resolver.clear();

    expect(resolver["timers"].size).toBe(0);
    expect(resolver["sources"].size).toBe(0);
    expect(resolver["pendingUpdates"].length).toBe(0);
  });
});
