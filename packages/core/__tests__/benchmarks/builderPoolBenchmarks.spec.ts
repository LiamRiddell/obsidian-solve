/**
 * BytecodeBuilder Pooling Benchmarks
 *
 * Measures the parse+compile performance impact of BytecodeBuilder pooling.
 * Compares the `new BytecodeBuilder()` pattern (before) against pooled
 * builder reuse (after). Eliminates 4 heap allocations per expression:
 * opcode array, number array, string array, and stringIndex Map.
 *
 * Design:
 *   - Isolates parse+compile from lex and execute phases
 *   - Pre-tokenizes expressions before the measurement loop
 *   - Uses a MinMaxMeanNs timer for nanosecond-precision measurement
 *   - Covers expressions of varying complexity (simple, arithmetic, function,
 *     percentage, mixed)
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, BIGINT_PACKAGE, DATETIME_PACKAGE, DICE_PACKAGE, FUNCTION_PACKAGE, PERCENTAGE_PACKAGE, UOM_PACKAGE, VARIABLES_PACKAGE, VECTOR_PACKAGE } from "@solve-js/packages";
import { describe, expect, test, afterAll } from "@jest/globals";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { Lexer } from "@solve-js/lexer/Lexer";
import type { Token } from "@solve-js/lexer/Token";

// Import all provider registration functions










// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Pre-configured registry with all built-in parselets. Created once. */
function createConfiguredParser(): Parser {
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
  registerPackageForTesting(DATETIME_PACKAGE, registry);
  registerPackageForTesting(DICE_PACKAGE, registry);
  registerPackageForTesting(VARIABLES_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
  registerPackageForTesting(VECTOR_PACKAGE, registry);
  registerPackageForTesting(BIGINT_PACKAGE, registry);
  return new Parser(registry);
}

/** Tokenize an expression, discarding whitespace. */
function tokenize(input: string): Token[] {
  const lexer = new Lexer("en");
  lexer.reset(input);
  return Array.from(lexer).filter(
    (t) => t.type !== "WS" && t.type !== "NEWLINE" && !t.type.startsWith("MD_")
  );
}

/** Pre-allocated buffer pool (mirrors ExpressionEngine.bufferPool). */
function createBufferPool(): { opcodes: Uint8Array; numbers: Float64Array } {
  return {
    opcodes: new Uint8Array(512),
    numbers: new Float64Array(128),
  };
}

/**
 * High-precision nanosecond timer result.
 */
interface TimerResultNs {
  minNs: number;
  maxNs: number;
  meanNs: number;
  medianNs: number;
  p95Ns: number;
  iterations: number;
}

/**
 * Run a function `iterations` times and return nanosecond-level stats.
 * Uses process.hrtime() for nanosecond precision (bypasses
 * performance.now()'s microsecond rounding on some platforms).
 */
function timeFnNs(fn: () => void, iterations: number, warmup = 100): TimerResultNs {
  // Warmup — prime V8 IC caches and JIT compilation
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime();
    fn();
    const t1 = process.hrtime();
    // Convert [seconds, nanoseconds] tuple to total nanoseconds
    times.push((t1[0] - t0[0]) * 1e9 + (t1[1] - t0[1]));
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const p95Index = Math.floor(iterations * 0.95);

  return {
    minNs: sorted[0],
    maxNs: sorted[sorted.length - 1],
    meanNs: sum / iterations,
    medianNs: sorted[Math.floor(iterations / 2)],
    p95Ns: sorted[p95Index],
    iterations,
  };
}

// ──────────────────────────────────────────────
// Benchmark expressions
// ──────────────────────────────────────────────

interface ExpressionCase {
  name: string;
  expression: string;
  /** Number of parse+compile iterations per measurement batch */
  iterations: number;
}

const EXPRESSIONS: ExpressionCase[] = [
  { name: "simple_literal",   expression: "42",                    iterations: 100_000 },
  { name: "simple_add",       expression: "1 + 2",                 iterations: 50_000  },
  { name: "arithmetic",       expression: "1 + 2 * 3 - 4 / 2",    iterations: 30_000  },
  { name: "nested_parens",    expression: "(1 + 2) * (3 + 4)",    iterations: 30_000  },
  { name: "function_call",    expression: "sqrt(144)",             iterations: 30_000  },
  { name: "percentage",       expression: "50% of 200",           iterations: 20_000  },
  { name: "unit_conversion",  expression: "100 cm to m",          iterations: 20_000  },
  { name: "datetime",         expression: "now + 5 days",         iterations: 15_000  },
  { name: "variable_assign",  expression: ":x = 42",              iterations: 30_000  },
  { name: "mixed_complex",    expression: "sqrt(144) + 50% of 200 - 3 * (10 + 5)", iterations: 10_000 },
];

// ──────────────────────────────────────────────
// Benchmark Suite
// ──────────────────────────────────────────────

interface PoolingBenchmarkResult {
  name: string;
  withoutPool: { meanNs: number; p95Ns: number; medianNs: number };
  withPool: { meanNs: number; p95Ns: number; medianNs: number };
  /** Absolute savings in nanoseconds */
  deltaNs: number;
  /** Relative speedup (withPool / withoutPool). < 1 means faster with pool. */
  speedupRatio: number;
  /** Percentage improvement ((without - with) / without * 100) */
  percentImprovement: number;
}

interface BuilderPoolResults {
  timestamp: string;
  summary: {
    meanDeltaNs: number;
    meanPercentImprovement: number;
    /** How many ns the 4 builder allocations cost per expression */
    estimatedAllocCostNs: number;
  };
  details: PoolingBenchmarkResult[];
  metadata: {
    nodeVersion: string;
    platform: string;
    poolSize: number;
    description: string;
  };
}

describe("BytecodeBuilder Pooling Benchmarks", () => {
  const results: BuilderPoolResults = {
    timestamp: "",
    summary: { meanDeltaNs: 0, meanPercentImprovement: 0, estimatedAllocCostNs: 0 },
    details: [],
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      poolSize: 4,
      description:
        "Measures parse+compile phase comparing 'new BytecodeBuilder()' (before) vs pooled builder reuse (after). " +
        "Eliminates 4 heap allocations per expression: opcode[], numbers[], strings[], stringIndex Map.",
    },
  };

  afterAll(() => {
    results.timestamp = new Date().toISOString();

    // ── Compute summary ──
    const improvements = results.details.map((d) => d.percentImprovement);
    results.summary.meanPercentImprovement =
      improvements.reduce((a, b) => a + b, 0) / improvements.length;
    results.summary.meanDeltaNs =
      results.details.reduce((a, b) => a + b.deltaNs, 0) / results.details.length;
    // Delta is the ns saved by avoiding allocations — the pooled mean is
    // lower, so deltaNs = withoutPool - withPool. This IS the estimated
    // allocation cost per expression.
    results.summary.estimatedAllocCostNs = results.summary.meanDeltaNs;

    // ── Pretty-print console table ──
    console.log("\n" + "=".repeat(90));
    console.log("  🔧 BYTECODE BUILDER POOLING BENCHMARK");
    console.log("  Measures parse+compile: new BytecodeBuilder() vs pooled reuse");
    console.log("=".repeat(90));
    console.log(`  Node: ${results.metadata.nodeVersion}  Platform: ${results.metadata.platform}`);
    console.log(`  Pool size: ${results.metadata.poolSize} builders, ${EXPRESSIONS.length} expression types`);
    console.log("=".repeat(90));

    console.log(
      "\n  ┌" +
      "─".repeat(16) + "┬" +
      "─".repeat(12) + "┬" +
      "─".repeat(12) + "┬" +
      "─".repeat(12) + "┬" +
      "─".repeat(12) + "┬" +
      "─".repeat(12) + "┐"
    );
    console.log(
      `  │ ${"Expression".padEnd(14)} │ ${"No pool ns".padStart(10)} │ ` +
      `${"Pooled ns".padStart(10)} │ ${"Delta ns".padStart(10)} │ ` +
      `${"Improve%".padStart(10)} │ ${"Speedup".padStart(10)} │`
    );
    console.log(
      "  ├" +
      "─".repeat(16) + "┼" +
      "─".repeat(12) + "┼" +
      "─".repeat(12) + "┼" +
      "─".repeat(12) + "┼" +
      "─".repeat(12) + "┼" +
      "─".repeat(12) + "┤"
    );

    for (const d of results.details) {
      const symbol = d.percentImprovement > 0 ? "✅" : "➖";
      console.log(
        `  │ ${d.name.padEnd(14)} │ ${d.withoutPool.meanNs.toFixed(0).padStart(10)} │ ` +
        `${d.withPool.meanNs.toFixed(0).padStart(10)} │ ${d.deltaNs.toFixed(0).padStart(10)} │ ` +
        `${d.percentImprovement.toFixed(1).padStart(9)}% │ ${d.speedupRatio.toFixed(2).padStart(9)}× │ ` +
        symbol
      );
    }

    console.log(
      "  └" +
      "─".repeat(16) + "┴" +
      "─".repeat(12) + "┴" +
      "─".repeat(12) + "┴" +
      "─".repeat(12) + "┴" +
      "─".repeat(12) + "┴" +
      "─".repeat(12) + "┘"
    );

    console.log("\n  Summary:");
    console.log(`    Mean allocation savings : ${results.summary.estimatedAllocCostNs.toFixed(0)} ns/expr`);
    console.log(`    Mean improvement        : ${results.summary.meanPercentImprovement.toFixed(1)}%`);
    console.log(`    Pool size               : ${results.metadata.poolSize} builders`);
    console.log(`    Description: ${results.metadata.description}`);
    console.log("\n" + "=".repeat(90) + "\n");

    // ── Save to baseline JSON ──
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "builder-pool-baseline.json"),
      JSON.stringify(results, null, 2)
    );
  });

  // ── Per-expression benchmarks ──

  for (const expr of EXPRESSIONS) {
    test(`builder pooling for "${expr.name}"`, () => {
      // ── Setup: tokenize once, reuse across all iterations ──
      const tokens = tokenize(expr.expression);
      const parser = createConfiguredParser();

      // ── WITHOUT POOLING: new BytecodeBuilder() every iteration ──
      // Create a fresh buffer inside the timed fn so both paths incur
      // the same allocation overhead (cancels out in the comparison).
      const withoutResult = timeFnNs(
        () => {
          const buf = createBufferPool();
          const builder = new BytecodeBuilder();
          parser.load(tokens);
          parser.parseExpression(0, builder);
          const program = builder.buildInto(buf);
          // Touch the result to prevent dead-code elimination
          if (program.opcodes.length > 0) void program.opcodes[0];
        },
        expr.iterations
      );

      // ── WITH POOLING: pre-allocate 4 builders, cycle through them ──
      // Mirrors ExpressionEngine.builderPool pattern exactly.
      // Note: re-parsing the same tokens every iteration means the builder's
      // stringIndex Map reuses internal hash slots — real-world usage with
      // varying expressions may show slightly higher cost.
      const pool: BytecodeBuilder[] = [
        new BytecodeBuilder(),
        new BytecodeBuilder(),
        new BytecodeBuilder(),
        new BytecodeBuilder(),
      ];
      let poolIdx = 0;

      const withResult = timeFnNs(
        () => {
          const buf = createBufferPool();
          const builder = pool[poolIdx++ % pool.length];
          builder.reset();
          parser.load(tokens);
          parser.parseExpression(0, builder);
          const program = builder.buildInto(buf);
          if (program.opcodes.length > 0) void program.opcodes[0];
        },
        expr.iterations
      );

      // ── Compute deltas ──
      const deltaNs = withoutResult.meanNs - withResult.meanNs;
      const speedupRatio = withResult.meanNs / withoutResult.meanNs;
      const percentImprovement =
        withoutResult.meanNs > 0
          ? ((withoutResult.meanNs - withResult.meanNs) / withoutResult.meanNs) * 100
          : 0;

      results.details.push({
        name: expr.name,
        withoutPool: {
          meanNs: withoutResult.meanNs,
          p95Ns: withoutResult.p95Ns,
          medianNs: withoutResult.medianNs,
        },
        withPool: {
          meanNs: withResult.meanNs,
          p95Ns: withResult.p95Ns,
          medianNs: withResult.medianNs,
        },
        deltaNs,
        speedupRatio,
        percentImprovement,
      });

      // ── Assertions ──
      // Pooling should not cause catastrophic regression.
      // For very simple expressions (single literal, simple_add), the
      // parse+compile cost is so small that pool cycling overhead
      // (reset() + poolIdx++ % pool.length) can exceed allocation savings.
      // Use a generous tolerance to eliminate CI flakes — these are
      // measurement benchmarks, not performance correctness tests.
      expect(withResult.meanNs).toBeLessThanOrEqual(withoutResult.meanNs * 2.0);
    });
  }
});
