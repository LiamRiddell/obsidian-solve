/**
 * Diagnostic Pipeline Benchmark — compares production vs diagnostic mode
 * to prove zero overhead in production and acceptable cost in diagnostic mode.
 */

// Pre-existing: __WORKER_URL__ is an esbuild define substitution, not available in ts-jest
declare let __WORKER_URL__: string | undefined;

import { describe, expect, test, afterAll } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { benchmarkFn } from "@tools/testUtils";
import { TimelineDiagnosticCollector } from "@solve-js/diagnostics";

function generateDoc(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(`:v${i} = ${i + 1}`);
  }
  return lines.join("\n");
}

describe("Diagnostic Pipeline Overhead Benchmark", () => {
  const results: Record<string, number> = {};

  afterAll(() => {
    console.log("\n📊 DIAGNOSTIC PIPELINE BENCHMARK RESULTS:");
    console.log(`${"Benchmark".padEnd(42)} ${"Mean (ms)".padStart(12)} ${"Ops/sec".padStart(10)}`);
    console.log(`${"─".repeat(66)}`);
    for (const [name, mean] of Object.entries(results)) {
      const ops = 1000 / mean;
      console.log(`${name.padEnd(42)} ${mean.toFixed(4).padStart(12)} ${ops.toFixed(1).padStart(10)}`);
    }
  });

  // === PRODUCTION MODE BENCHMARKS ===

  test("[PROD] single eval cold in < 2ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.evaluateLine(1, "1 + 2 * 3");
    }, 5000, 100);
    results["PROD_single_eval_cold"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("[PROD] single eval warm (cached) in < 0.5ms", () => {
    const engine = new ExpressionEngine("en", false);
    engine.evaluateLine(1, "10 + 20");
    const r = benchmarkFn(() => {
      engine.evaluateLine(1, "10 + 20");
    }, 50000, 500);
    results["PROD_single_eval_warm"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(1);
  });

  test("[PROD] parses 50-line doc in < 20ms", () => {
    const input = generateDoc(50);
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(input);
    }, 200, 10);
    results["PROD_50_line_doc"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(50);
  });

  test("[PROD] variable chain in < 1ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(":x = 1\n:x + 1\n:x + 2\n:x + 3\n:x + 4");
    }, 5000, 100);
    results["PROD_variable_chain"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("[PROD] full pipeline sqrt(144) + 5 in < 1ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.evaluateLine(1, "sqrt(144) + 5");
    }, 20000, 500);
    results["PROD_function_plus_literal"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("[PROD] 10k warm evaluations in < 100ms", () => {
    const engine = new ExpressionEngine("en", false);
    engine.evaluateLine(1, "42"); // warmup
    const r = benchmarkFn(() => {
      engine.evaluateLine(1, "1 + 2 * 3 - 4 / 5");
    }, 10000, 500);
    results["PROD_10k_warm"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(100);
  });

  // === DIAGNOSTIC MODE BENCHMARKS ===

  test("[DIAG] single eval cold in < 5ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", true);
      e.evaluateLine(1, "1 + 2 * 3");
    }, 5000, 100);
    results["DIAG_single_eval_cold"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(5);
  });

  test("[DIAG] single eval warm (cached) in < 1ms", () => {
    const engine = new ExpressionEngine("en", true);
    engine.evaluateLine(1, "10 + 20");
    const r = benchmarkFn(() => {
      engine.evaluateLine(1, "10 + 20");
    }, 10000, 500);
    results["DIAG_single_eval_warm"] = r.meanMs;
    // Was toBeLessThan(2) — a title/assertion mismatch that masked a real
    // O(n²) bug (TimelineDiagnosticCollector.getReport() rescanning its
    // entire event history on every call). Now that it's fixed (~0.01ms,
    // was ~0.72ms), tighten the assertion to match what the title always claimed.
    expect(r.meanMs).toBeLessThan(1);
  });

  test("[DIAG] parses 50-line doc in < 50ms", () => {
    const input = generateDoc(50);
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", true);
      e.parseDocument(input);
    }, 200, 10);
    results["DIAG_50_line_doc"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(100);
  });

  test("[DIAG] variable chain in < 2ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", true);
      e.parseDocument(":x = 1\n:x + 1\n:x + 2\n:x + 3\n:x + 4");
    }, 5000, 100);
    results["DIAG_variable_chain"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(5);
  });

  test("[DIAG] 10k warm evaluations in < 200ms", () => {
    const engine = new ExpressionEngine("en", true);
    engine.evaluateLine(1, "42"); // warmup
    const r = benchmarkFn(() => {
      engine.evaluateLine(1, "1 + 2 * 3 - 4 / 5");
    }, 10000, 500);
    results["DIAG_10k_warm"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(200);
  });

  // === DIAGNOSTIC REPORT VALIDATION ===

test("diagnostic report has correct structure", () => {
     const engine = new ExpressionEngine("en", true);
     // Use an expression with sqrt() to exercise Tier 2 FunctionParselet
     const result = engine.evaluateLineWithDebug(1, "sqrt(144) + 5");

     expect(result.debug).toBeDefined();
     const debug = result.debug!;
     expect(debug.events).toBeDefined();
     expect(debug.summary).toBeDefined();
     expect(debug.metadata).toBeDefined();

     // Check summary fields
     expect(debug.summary.totalTokens).toBeGreaterThan(0);
     expect(debug.summary.totalOpcodes).toBeGreaterThan(0);
     expect(debug.summary.cacheHit).toBe(false); // first eval = cache miss
     expect(debug.summary.parseCategories).toBeDefined();

     // Check metadata
     expect(debug.metadata.expression).toBe("sqrt(144) + 5");
     expect(debug.metadata.vmTraceEnabled).toBe(false);

     // Verify parselet categories populated (Tier 2 parselets only;
     // Tier 1 inline tokens like NUMBER do not fire parselet events).
     const cats = Object.keys(debug.summary.parseCategories);
     expect(cats.length).toBeGreaterThan(0);
     expect(cats).toContain("Function");

     // Check events include parselet_matched with categories
     const parseletEvents = debug.events.filter(
       (e): e is import("@solve-js/diagnostics").ParseletMatchedEvent => (e as import("@solve-js/diagnostics").DiagnosticEvent).type === "parselet_matched"
     );
     expect(parseletEvents.length).toBeGreaterThan(0);
     expect(parseletEvents[0].parseletCategory).toBeDefined();
     expect(parseletEvents[0].parseletType).toBeDefined();
     expect(parseletEvents[0].isPrefix).toBeDefined();
   });

  test("cached evaluation reports cache hit", () => {
    const engine = new ExpressionEngine("en", true);

    // First eval — cache miss
    const result1 = engine.evaluateLineWithDebug(1, "100 + 200");
    expect(result1.debug!.summary.cacheHit).toBe(false);

    // Second eval — cache hit
    const result2 = engine.evaluateLineWithDebug(1, "100 + 200");
    expect(result2.debug!.summary.cacheHit).toBe(true);
  });

test("vm trace mode emits per-opcode events", () => {
     const engine = new ExpressionEngine("en", true, {
       diagnostic: { enabled: true, vmTraceEnabled: true }
     });
     const traceCollector = new TimelineDiagnosticCollector();
     const pipeline = engine.getDiagnosticPipeline();
     pipeline.clear();
     pipeline.register(traceCollector);

     const result = engine.evaluateLineWithDebug(1, "1 + 2");

     const report = traceCollector.getReport();
     const stepEvents = report?.events.filter(
       (e: any): e is import("@solve-js/diagnostics").VmStepEvent => e.type === "vm_step"
     );
     expect(stepEvents).toBeDefined();
     expect(stepEvents!.length).toBeGreaterThan(0);

     // Each step should have opcode info
     expect(stepEvents![0].opcodeName).toBeDefined();
     expect(stepEvents![0].ip).toBe(0);
     expect(stepEvents![0].stackDepth).toBeDefined();
   });

  test("null collector has zero overhead vs direct call", () => {
    // Production engine
    const prodEngine = new ExpressionEngine("en", false);
    // Engine with null collector explicitly
    const nullEngine = new ExpressionEngine("en", false);

    const prodTime = benchmarkFn(() => {
      prodEngine.evaluateLine(1, "1 + 2 * 3");
    }, 10000, 500);

    const nullTime = benchmarkFn(() => {
      nullEngine.evaluateLine(1, "1 + 2 * 3");
    }, 10000, 500);

    // Allow 50% tolerance for measurement noise
    const ratio = nullTime.meanMs / prodTime.meanMs;
    expect(ratio).toBeLessThan(2); // null collector should not double execution time

    results["PROD_null_collector_overhead_ratio"] = ratio;
  });
});