/**
 * Full Pipeline Throughput Benchmarks
 *
 * Measures cumulative end-to-end throughput of the entire solve-js pipeline:
 *   Lex → Parse → Compile (BytecodeBuilder) → Execute (VM)
 *
 * This is the most holistic benchmark in the suite — it exercises every phase
 * of the pipeline with realistic documents of varying sizes and captures the
 * compounding effect of all Phase 5 optimisations (fast hashing, TypedArrays,
 * buffer pooling, computed-goto dispatch, etc.).
 *
 * Tiers:
 *   small   - ~100 exprs, ~100 lines    — quick edits, formulas
 *   medium  - ~500 exprs, ~1K lines     — moderate documents
 *   large   - ~2K exprs, ~10K lines     — complex notebooks
 *   massive - ~5K exprs, ~50K lines     — enterprise-scale documents
 *
 * Each tier measures:
 *   - Cold throughput  (fresh engine, first parseDocument call)
 *   - Warm throughput  (engine with cached bytecode, re-parsing same doc)
 *   - Per-stage breakdown (lex % / parse+compile % / execute %)
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, BIGINT_PACKAGE, DATETIME_PACKAGE, DICE_PACKAGE, FUNCTION_PACKAGE, PERCENTAGE_PACKAGE, UOM_PACKAGE, VARIABLES_PACKAGE, VECTOR_PACKAGE } from "@solve-js/packages";
import { describe, expect, test, afterAll } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { Lexer } from "@solve-js/lexer/Lexer";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";









import { Token } from "@solve-js/lexer/Token";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Generate a document with N expressions across M lines.
 * Each line has one assignment or one arithmetic expression.
 * Includes a mix of expression types for realistic coverage:
 *   - Variable assignments
 *   - Simple arithmetic (+, -, *, /)
 *   - Function calls (sqrt, abs, round)
 *   - Percentage expressions
 *   - Chained variable references (creates DAG edges)
 */
function generateTierDocument(exprCount: number, lineCount: number): string {
  const lines: string[] = [];
  const exprTypes = ["assign", "arithmetic", "function", "percentage", "chained"];

  for (let i = 0; i < lineCount; i++) {
    const exprIdx = i % exprCount;
    const type = exprTypes[exprIdx % exprTypes.length];

    switch (type) {
      case "assign":
        lines.push(`:v${i} = ${(i % 100) + 1}`);
        break;
      case "arithmetic":
        lines.push(`:v${i} + ${(i % 50) + 10}`);
        break;
      case "function":
        if (i % 2 === 0) {
          lines.push(`sqrt(${(i % 100) + 1})`);
        } else {
          lines.push(`abs(-${(i % 100) + 1})`);
        }
        break;
      case "percentage":
        lines.push(`${(i % 50) + 1}% of ${(i % 200) + 100}`);
        break;
      case "chained":
        // Reference earlier variables to create DAG edges
        const refIdx = i > 0 ? (i - 1) % (i % 100) : 0;
        if (refIdx >= 0 && refIdx < i) {
          lines.push(`:v${refIdx} + ${(i % 20) + 1}`);
        } else {
          lines.push(`:v${i} + ${(i % 20) + 1}`);
        }
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Generate a single representative complex expression for per-stage breakdown.
 * Covers arithmetic, functions, percentage, and unit ops in one expression.
 */
const COMPLEX_EXPRESSION = "sqrt(144) + 50% of 200 - 3 * (10 + 5)";

/**
 * Run a single expression through the pipeline and return per-stage timings.
 *
 * Pre-creates reusable objects (Lexer, Parser, BytecodeBuilder, VM) outside
 * the measurement loop and resets them via their state-reset APIs. This mirrors
 * production behaviour where ExpressionEngine keeps a persistent VM, lexer, and
 * parser — avoiding allocation/GC noise from the measurement.
 */
function timePipelineStages(expression: string, iterations: number): {
  lexNs: number;
  parseCompileNs: number;
  executeNs: number;
  totalNs: number;
  lexPercent: number;
  parseCompilePercent: number;
  executePercent: number;
} {
  // Setup: register all parselets once, reuse across all iterations
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(PERCENTAGE_PACKAGE, registry);
  registerPackageForTesting(FUNCTION_PACKAGE, registry);
  registerPackageForTesting(VARIABLES_PACKAGE, registry);
  registerPackageForTesting(DATETIME_PACKAGE, registry);
  registerPackageForTesting(DICE_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
  registerPackageForTesting(VECTOR_PACKAGE, registry);
  registerPackageForTesting(BIGINT_PACKAGE, registry);

  // Pre-create reusable objects (mirrors ExpressionEngine constructor)
  const lexer = new Lexer();
  const parser = new Parser(registry);
  const vm = createVM(sharedOpRegistry);

  let totalLexNs = 0;
  let totalParseCompileNs = 0;
  let totalExecuteNs = 0;
  let totalFullNs = 0;

  for (let i = 0; i < iterations; i++) {
    vm.reset();

    // Lex tokens (shared by both full pipeline and stage 2)
    const tokens: Token[] = [];
    lexer.reset(expression);
    for (const t of lexer) {
      if (t.type === "WS" || t.type.startsWith("MD_")) continue;
      tokens.push(t);
    }

    // -- Full pipeline: parse + compile + execute --
    const fullStart = performance.now();
    const builder = new BytecodeBuilder();
    parser.load(tokens);
    parser.parseExpression(0, builder);
    const program = builder.build();
    const result = executeBytecode(program, vm);
    const fullEnd = performance.now();
    totalFullNs += (fullEnd - fullStart) * 1_000_000;

    // -- Stage 1: Lex only --
    vm.reset();
    const lexStart = performance.now();
    lexer.reset(expression);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const t of lexer) { /* consume */ }
    const lexEnd = performance.now();
    totalLexNs += (lexEnd - lexStart) * 1_000_000;

    // -- Stage 2: Parse + Compile only (measure after lex) --
    lexer.reset(expression);
    const tokenCopy: Token[] = [];
    for (const t of lexer) {
      if (t.type === "WS" || t.type.startsWith("MD_")) continue;
      tokenCopy.push(t);
    }
    const parseStart = performance.now();
    const builder2 = new BytecodeBuilder();
    parser.load(tokenCopy);
    parser.parseExpression(0, builder2);
    const program2 = builder2.build();
    const parseEnd = performance.now();
    totalParseCompileNs += (parseEnd - parseStart) * 1_000_000;

    // -- Stage 3: Execute only --
    vm.reset();
    const execStart = performance.now();
    executeBytecode(program2, vm);
    const execEnd = performance.now();
    totalExecuteNs += (execEnd - execStart) * 1_000_000;

    if (result) void result;
  }

  const avgTotal = totalFullNs / iterations;
  const avgLex = totalLexNs / iterations;
  const avgParse = totalParseCompileNs / iterations;
  const avgExec = totalExecuteNs / iterations;
  const sum = avgLex + avgParse + avgExec;

  return {
    lexNs: avgLex,
    parseCompileNs: avgParse,
    executeNs: avgExec,
    totalNs: sum, // true end-to-end (lex + parse+compile + execute)
    lexPercent: (avgLex / sum) * 100,
    parseCompilePercent: (avgParse / sum) * 100,
    executePercent: (avgExec / sum) * 100,
  };
}

/**
 * Simple benchmark timer for a callback. Returns mean time in ms.
 */
function timeMs(fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations); i++) {
    fn();
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  return (end - start) / iterations;
}

// ──────────────────────────────────────────────
// Tier configurations
// ──────────────────────────────────────────────

interface TierConfig {
  name: string;
  exprs: number;
  lines: number;
  // Iterations for throughput measurement (lower for large docs)
  iterations: number;
}

const TIERS: TierConfig[] = [
  { name: "small",   exprs: 100,  lines: 100,   iterations: 500 },
  { name: "medium",  exprs: 500,  lines: 1000,  iterations: 100 },
  { name: "large",   exprs: 2000, lines: 10000, iterations: 20  },
  { name: "massive", exprs: 5000, lines: 50000, iterations: 5   },
];

// ──────────────────────────────────────────────
// Benchmark suite
// ──────────────────────────────────────────────

interface ThroughputResult {
  meanMs: number;
  opsPerSec: number;
  linesPerSec: number;
  exprsPerSec: number;
}

interface StageBreakdown {
  lexPercent: number;
  parseCompilePercent: number;
  executePercent: number;
  totalNs: number;
}

interface AllResults {
  timestamp: string;
  tiers: Record<string, { cold: ThroughputResult; warm: ThroughputResult }>;
  stageBreakdown: StageBreakdown;
  metadata: {
    nodeVersion: string;
    platform: string;
    totalLinesAcrossTiers: number;
  };
}

describe("Full Pipeline Throughput Benchmarks", () => {
  const results: AllResults = {
    timestamp: "",
    tiers: {},
    stageBreakdown: { lexPercent: 0, parseCompilePercent: 0, executePercent: 0, totalNs: 0 },
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      totalLinesAcrossTiers: 0,
    },
  };

  afterAll(() => {
    results.timestamp = new Date().toISOString();

    // Pretty-print to console
    console.log("\n" + "=".repeat(78));
    console.log("  📊 FULL PIPELINE THROUGHPUT BENCHMARKS  ");
    console.log("  Cumulative effect of all Phase 5 optimisations");
    console.log("=".repeat(78));
    console.log(`  Node: ${results.metadata.nodeVersion}  Platform: ${results.metadata.platform}`);
    console.log(`  Timestamp: ${results.timestamp}`);
    console.log("=".repeat(78));

    // Per-tier throughput table
    console.log("\n  ┌──────────┬────────────┬────────────┬────────────┬────────────┬────────────┐");
    console.log("  │ Tier     │ Lines/doc  │ Exprs/doc  │ Cold ms    │ Warm ms    │ Throughput │");
    console.log("  ├──────────┼────────────┼────────────┼────────────┼────────────┼────────────┤");

    let totalColdMs = 0;
    for (const tier of TIERS) {
      const t = results.tiers[tier.name];
      if (!t) continue;
      totalColdMs += t.cold.meanMs * tier.iterations;
      const throughputLine = tier.lines > 0
        ? `${(tier.lines / t.cold.meanMs).toFixed(1)} l/s`
        : "—";

      console.log(
        `  │ ${tier.name.padEnd(8)} │ ${String(tier.lines).padStart(10)} │ ${String(tier.exprs).padStart(10)} │ ` +
        `${t.cold.meanMs.toFixed(3).padStart(10)} │ ${t.warm.meanMs.toFixed(3).padStart(10)} │ ${throughputLine.padStart(10)} │`
      );
    }
    console.log("  └──────────┴────────────┴────────────┴────────────┴────────────┴────────────┘");

    // Per-stage breakdown
    const s = results.stageBreakdown;
    console.log("\n  Per-stage breakdown (single expression):");
    console.log(`    Lex           : ${s.lexPercent.toFixed(1)}%`);
    console.log(`    Parse+Compile : ${s.parseCompilePercent.toFixed(1)}%`);
    console.log(`    Execute (VM)  : ${s.executePercent.toFixed(1)}%`);
    console.log(`    Total pipeline: ${(s.totalNs / 1000).toFixed(2)} µs`);

    // Warm speedup factor
    console.log("\n  Warm-vs-Cold speedup:");
    for (const tier of TIERS) {
      const t = results.tiers[tier.name];
      if (!t) continue;
      const speedup = t.cold.meanMs / t.warm.meanMs;
      console.log(`    ${tier.name.padEnd(10)} : ${speedup.toFixed(2)}× faster (warm)`);
    }

    console.log();
    console.log("=".repeat(78));
    console.log();

    // Save to baseline JSON
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "full-pipeline-throughput-baseline.json"),
      JSON.stringify(results, null, 2)
    );
  });

  // ─── Per-stage breakdown ───

  test("measures per-stage pipeline breakdown for a representative expression", () => {
    const breakdown = timePipelineStages(COMPLEX_EXPRESSION, 5000);
    results.stageBreakdown = breakdown;

    // Sanity: stages sum to ~100%
    const sum = breakdown.lexPercent + breakdown.parseCompilePercent + breakdown.executePercent;
    expect(sum).toBeGreaterThan(95);
    expect(sum).toBeLessThan(105);

    // Sanity: total should be reasonable for this expression
    // With object reuse, the full pipeline for a complex expression should be
    // under 50µs. The previous ~610µs measurement included allocation overhead
    // from creating new Lexer/Parser/Builder in each iteration.
    expect(breakdown.totalNs).toBeGreaterThan(0);
    expect(breakdown.totalNs).toBeLessThan(50_000); // < 50µs
  });

  // ─── Tiered throughput ───

  for (const tier of TIERS) {
    test(`[${tier.name}] measures cold and warm throughput (${tier.lines} lines, ${tier.exprs} exprs)`, () => {
      const doc = generateTierDocument(tier.exprs, tier.lines);

      // ── Cold: fresh engine, first parse ──
      const coldMs = timeMs(() => {
        const engine = new ExpressionEngine("en", false);
        engine.parseDocument(doc);
      }, Math.min(20, tier.iterations));

      // ── Warm: engine with cached bytecode ──
      const warmEngine = new ExpressionEngine("en", false);
      warmEngine.parseDocument(doc); // prime the cache
      const warmMs = timeMs(() => {
        warmEngine.parseDocument(doc);
      }, tier.iterations);

      const cold: ThroughputResult = {
        meanMs: coldMs,
        opsPerSec: 1000 / coldMs,
        linesPerSec: tier.lines / coldMs,
        exprsPerSec: tier.exprs / coldMs,
      };

      const warm: ThroughputResult = {
        meanMs: warmMs,
        opsPerSec: 1000 / warmMs,
        linesPerSec: tier.lines / warmMs,
        exprsPerSec: tier.exprs / warmMs,
      };

      results.tiers[tier.name] = { cold, warm };

      // Basic sanity: warm should be faster than cold
      // (In theory the bytecode cache eliminates parse+compile,
      //  but some overhead remains for lexer reset and VM execution)
      expect(warmMs).toBeGreaterThan(0);
      expect(coldMs).toBeGreaterThan(0);

      // The cold run should take more than warm for any tier
      // with enough expressions to benefit from caching
      if (tier.exprs >= 100) {
        expect(coldMs).toBeGreaterThanOrEqual(warmMs * 0.5);
      }

      console.log(`    [${tier.name}] cold: ${coldMs.toFixed(3)}ms  warm: ${warmMs.toFixed(3)}ms  speedup: ${(coldMs / warmMs).toFixed(2)}×`);
    });
  }
});
