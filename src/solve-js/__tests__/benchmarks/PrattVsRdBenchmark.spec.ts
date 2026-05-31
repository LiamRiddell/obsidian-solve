/**
 * Pratt vs Recursive Descent Parser Benchmark Comparison
 *
 * Runs the parse+compile micro-benchmark and pipeline throughput benchmark
 * with both parser implementations and reports the delta.
 *
 * Usage: npx jest --no-coverage src/solve-js/__tests__/benchmarks/PrattVsRdBenchmark.spec.ts
 */
import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

// ── Test expressions (same as parseCompileMicroBenchmarks) ───────────────────

const EXPRESSIONS: [string, string][] = [
  ["literal", "42"],
  ["simple_add", "2 + 3"],
  ["simple_mul", "6 * 7"],
  ["three_ops", "1 + 2 + 3"],
  ["four_ops", "2 + 3 * 4 - 5"],
  ["nested_parens", "((2 + 3) * (4 - 1))"],
  ["negation", "-42"],
  ["function_call", "sqrt(16)"],
  ["function_two_args", "min(3, 7, 2)"],
  ["percentage", "50%"],
  ["percentage_change", "50 to 100"],
  ["unit_conversion", "5 km to m"],
  ["unit_in", "100 in m"],
  ["datetime", "now"],
  ["dice", "roll(1, 6)"],
  ["vector", "vec3(1, 2, 3)"],
  ["variable_assign", ":x = 42"],
  ["variable_ref", ":x"],
  ["mixed_complex", "(2 + 3) * 4 - 10 / 2 + 50% of 200"],
  ["bigint_hex", "0xFF"],
];

// ── Benchmark helpers ────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  prattUs: number;
  rdUs: number;
  delta: number; // negative = RD faster
}

function benchParseCompile(engine: ExpressionEngine, iterations: number): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const [name, expr] of EXPRESSIONS) {
    // Warmup
    for (let i = 0; i < 100; i++) {
      engine.clear();
      try { engine.evaluateExpression(expr); } catch {}
    }

    // Timed run
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      engine.clear();
      try { engine.evaluateExpression(expr); } catch {}
    }
    const end = performance.now();

    results.push({
      name,
      prattUs: 0,
      rdUs: 0,
      delta: (end - start) / iterations * 1000, // ms → μs placeholder
    });
  }

  return results;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Pratt vs Recursive Descent Parser Benchmark", () => {
  const ITERATIONS = 5000;

  test("Parse+Compile Micro — Pratt", () => {
    const engine = new ExpressionEngine("en", false);
    const results = benchParseCompile(engine, ITERATIONS);

    const meanUs =
      results.reduce((s, r) => s + r.delta, 0) / results.length;

    console.log(`\n=== Pratt Parser — Parse+Compile Micro ===`);
    for (const r of results) {
      console.log(`  ${r.name.padEnd(20)} ${r.delta.toFixed(3)} μs`);
    }
    console.log(`  ${"MEAN".padEnd(20)} ${meanUs.toFixed(3)} μs`);
  });

  test("Parse+Compile Micro — Recursive Descent", () => {
    const engine = new ExpressionEngine("en", false, {
      parser: { useRecursiveDescent: true },
    });
    const results = benchParseCompile(engine, ITERATIONS);

    const meanUs =
      results.reduce((s, r) => s + r.delta, 0) / results.length;

    console.log(`\n=== RD Parser — Parse+Compile Micro ===`);
    for (const r of results) {
      console.log(`  ${r.name.padEnd(20)} ${r.delta.toFixed(3)} μs`);
    }
    console.log(`  ${"MEAN".padEnd(20)} ${meanUs.toFixed(3)} μs`);
  });

  test("Head-to-Head Comparison", () => {
    const prattEngine = new ExpressionEngine("en", false);
    const rdEngine = new ExpressionEngine("en", false, {
      parser: { useRecursiveDescent: true },
    });

    console.log(`\n=== Head-to-Head Parse+Compile Comparison (${ITERATIONS} iters each) ===`);
    console.log(
      `${"Expression".padEnd(22)} ${"Pratt (μs)".padEnd(14)} ${"RD (μs)".padEnd(14)} ${"Δ%".padEnd(10)}`
    );
    console.log("-".repeat(62));

    let totalPratt = 0;
    let totalRd = 0;

    for (const [name, expr] of EXPRESSIONS) {
      // Warmup
      for (let i = 0; i < 100; i++) {
        prattEngine.clear();
        rdEngine.clear();
        try { prattEngine.evaluateExpression(expr); } catch {}
        try { rdEngine.evaluateExpression(expr); } catch {}
      }

      // Pratt timed run
      const prattStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        prattEngine.clear();
        try { prattEngine.evaluateExpression(expr); } catch {}
      }
      const prattTime = (performance.now() - prattStart) / ITERATIONS * 1000;

      // RD timed run
      const rdStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        rdEngine.clear();
        try { rdEngine.evaluateExpression(expr); } catch {}
      }
      const rdTime = (performance.now() - rdStart) / ITERATIONS * 1000;

      const delta = ((rdTime - prattTime) / prattTime * 100);
      totalPratt += prattTime;
      totalRd += rdTime;

      const emoji = delta < 0 ? "✅" : delta < 2 ? "➖" : "⚠️";
      console.log(
        `${name.padEnd(22)} ${prattTime.toFixed(3).padStart(10)} ${rdTime.toFixed(3).padStart(10)} ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(6)}% ${emoji}`
      );
    }

    const meanDelta = ((totalRd - totalPratt) / totalPratt * 100);
    console.log("-".repeat(62));
    console.log(
      `${"TOTAL/MEAN".padEnd(22)} ${totalPratt.toFixed(3).padStart(10)} ${totalRd.toFixed(3).padStart(10)} ${(meanDelta >= 0 ? "+" : "") + meanDelta.toFixed(1).padStart(6)}%`
    );
    console.log(`\nNegative Δ% = RD faster ✅`);
  });
});
