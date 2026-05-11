import { describe, expect, test, jest } from "@jest/globals";
import { DependencyGraph } from "@/engine/vm/DependencyGraph";
import { LineCache, LineCacheEntry } from "@/engine/cache/LineCache";
import { DynamicValueResolver } from "@/engine/engine/DynamicValueResolver";
import { numberValue } from "@/engine/vm/Value";
import type { IDynamicDataSource } from "@/engine/engine/IDynamicDataSource";

describe("DynamicValueResolver", () => {
  test("enqueue and flush batch merges affected lines", () => {
    const dag = new DependencyGraph();
    const cache = new LineCache();

    dag.registerLine(10, ["x"], ["y"]);
    dag.registerLine(20, ["x"], []);
    dag.registerLine(30, ["y"], []);

    let batchLines: Set<number> = new Set();
    const resolver = new DynamicValueResolver(
      dag, cache,
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
    const cache = new LineCache();
    dag.registerLine(10, ["x"], []);

    let callCount = 0;
    const resolver = new DynamicValueResolver(
      dag, cache,
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
    const cache = new LineCache();

    let fetchCount = 0;
    const source: IDynamicDataSource = {
      name: "test",
      refreshIntervalMs: 10,
      async fetch() { fetchCount++; return 42; },
    };

    const resolver = new DynamicValueResolver(dag, cache, () => {}, 50);
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

  test("flushBatch marks dirty lines in cache", () => {
    const dag = new DependencyGraph();
    const cache = new LineCache();

    cache.set(10, new LineCacheEntry(numberValue(0), { opcodes: [], numbers: [], strings: [] }, ["x"], null, false));
    dag.registerLine(10, ["x"], []);

    const resolver = new DynamicValueResolver(dag, cache, () => {}, 10);
    resolver["enqueueUpdate"]("x", 99);
    resolver.flushBatch();

    expect(cache.isDirty(10)).toBe(true);
  });

  test("clear stops all timers and resets state", () => {
    const dag = new DependencyGraph();
    const cache = new LineCache();
    const resolver = new DynamicValueResolver(dag, cache, () => {}, 10);

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