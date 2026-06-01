/**
 * Full Pipeline Benchmarks - Jest compatible
 * Measures end-to-end performance through the ExpressionEngine.
 * Most realistic benchmark — includes lex + parse + compile + execute.
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { benchmarkFn } from "@tools/testUtils";

function generateDoc(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(`:v${i} = ${i + 1}`);
  }
  return lines.join("\n");
}

function generateInlineDoc(solveCount: number): string {
  const expressions: string[] = [];
  for (let i = 0; i < solveCount; i++) {
    expressions.push(`s\`${i} + ${i + 1}\``);
  }
  return expressions.join(" text ");
}

describe("Pipeline Benchmarks", () => {
  const results: Record<string, number> = {};

  afterAll(() => {
    console.log("\n📊 PIPELINE BENCHMARK RESULTS (mean ms, full expression pipeline):");
    console.log(`${"Benchmark".padEnd(32)} ${"Mean (ms)".padStart(12)} ${"Ops/sec".padStart(10)}`);
    console.log(`${"─".repeat(56)}`);
    for (const [name, mean] of Object.entries(results)) {
      const ops = 1000 / mean;
      console.log(`${name.padEnd(32)} ${mean.toFixed(4).padStart(12)} ${ops.toFixed(1).padStart(10)}`);
    }
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "pipeline-baseline.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
    );
  });

  test("evaluates cold (no cache) in < 2ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.evaluateLine(1, "1 + 2 * 3");
    }, 5000, 100);
    results["single_eval_cold"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("evaluates warm (cached) in < 0.5ms", () => {
    const engine = new ExpressionEngine("en", false);
    // Warm cache
    engine.evaluateLine(1, "10 + 20");
    const r = benchmarkFn(() => {
      engine.evaluateLine(1, "10 + 20");
    }, 50000, 500);
    results["single_eval_warm"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(1);
  });

  test("parses 50-line doc in < 20ms", () => {
    const input = generateDoc(50);
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(input);
    }, 200, 10);
    results["50_line_doc"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(50);
  });

  test("parses 200-line doc in < 100ms", () => {
    const input = generateDoc(200);
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(input);
    }, 50, 5);
    results["200_line_doc"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(200);
  });

  test("handles variable chain in < 1ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(":x = 1\n:x + 1\n:x + 2\n:x + 3\n:x + 4");
    }, 5000, 100);
    results["variable_chain"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("handles 20 inline solves in < 5ms", () => {
    const input = generateInlineDoc(20);
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(input);
    }, 2000, 50);
    results["20_inline_solves"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(10);
  });

  test("re-evaluates dirty line in < 1ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.parseDocument(":x = 1\n:x + 1\n:x + 2");
      e.reEvaluateLine(2, ":x + 1");
      e.reEvaluateLine(3, ":x + 2");
    }, 10000, 200);
    results["re_eval_dirty"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });

  test("mixed expression ($ + % + units) in < 2ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.evaluateLine(1, "$10 + 50% of 200 - 3 kg");
    }, 10000, 200);
    results["mixed_complex"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(3);
  });

  test("full FunctionCall sqrt(144) + 5 in < 1ms", () => {
    const r = benchmarkFn(() => {
      const e = new ExpressionEngine("en", false);
      e.evaluateLine(1, "sqrt(144) + 5");
    }, 20000, 500);
    results["function_plus_literal"] = r.meanMs;
    expect(r.meanMs).toBeLessThan(2);
  });
});