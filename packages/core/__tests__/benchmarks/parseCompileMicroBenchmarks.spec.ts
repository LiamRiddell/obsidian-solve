/**
 * Parse+Compile Micro-Benchmarks
 *
 * Isolates the parse+compile phase (Parser + BytecodeBuilder) from lexing
 * and VM execution. Tokens are pre-lexed outside the measurement loop,
 * so this benchmark measures ONLY the Pratt parselet dispatching + bytecode
 * emission pipeline.
 *
 * Purpose:
 *   - Measure the exact cost of parse+compile per expression type
 *   - Track bytecode size (opcodes, numbers, strings) alongside timing
 *   - Enable precise measurement of parser optimizations (P1–P6 from analysis)
 *   - Complement the existing parserBenchmarks (which omit BytecodeBuilder)
 *
 * Design:
 *   - Nanosecond precision via process.hrtime()
 *   - Pooled BytecodeBuilder reuse (4 builders, mirrors ExpressionEngine)
 *   - Pre-allocated buffer pool for zero-copy buildInto()
 *   - 15 expression types from simple (1 token) to complex (20+ tokens)
 *   - Reports μs/op, bytecode dimensions, and ops-per-μs throughput
 */

import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, BIGINT_PACKAGE, DATETIME_PACKAGE, DICE_PACKAGE, FUNCTION_PACKAGE, PERCENTAGE_PACKAGE, UOM_PACKAGE, VARIABLES_PACKAGE, VECTOR_PACKAGE } from "@solve-js/packages";
import { describe, expect, test, afterAll } from "@jest/globals";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { Lexer } from "@solve-js/lexer/Lexer";
import type { Token } from "@solve-js/lexer/Token";

// Import all provider registration functions










// ── Helpers ───────────────────────────────────────────────────────────────

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

function tokenize(input: string): Token[] {
  const lexer = new Lexer("en");
  lexer.reset(input);
  return Array.from(lexer).filter(
    (t) => t.type !== "WS" && t.type !== "NEWLINE" && !t.type.startsWith("MD_")
  );
}

interface TimerResultNs {
  minNs: number;
  maxNs: number;
  meanNs: number;
  medianNs: number;
  p95Ns: number;
  iterations: number;
  /** Bytecode dimensions measured on the last iteration */
  bytecodeSize: number;
  numbersSize: number;
  stringsSize: number;
}

function timeParseCompileNs(
  fn: () => BytecodeProgram,
  iterations: number,
  warmup = 100,
): TimerResultNs {
  // Warmup — prime V8 IC caches and JIT
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times: number[] = [];
  let lastProgram: BytecodeProgram | null = null;

  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime();
    lastProgram = fn();
    const t1 = process.hrtime();
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
    bytecodeSize: lastProgram?.opcodes.length ?? 0,
    numbersSize: lastProgram?.numbers.length ?? 0,
    stringsSize: lastProgram?.strings.length ?? 0,
  };
}

// ── Expression Cases ──────────────────────────────────────────────────────

interface ExpressionCase {
  name: string;
  expression: string;
  /** Number of parse+compile iterations */
  iterations: number;
  /** Expected minimum opcodes (sanity check) */
  minOpcodes: number;
}

const EXPRESSIONS: ExpressionCase[] = [
  { name: "literal",           expression: "42",                           iterations: 200_000, minOpcodes: 2 },
  { name: "simple_add",        expression: "1 + 2",                        iterations: 100_000, minOpcodes: 5 },
  { name: "simple_mul",        expression: "3 * 4",                        iterations: 100_000, minOpcodes: 5 },
  { name: "three_ops",         expression: "1 + 2 * 3",                    iterations: 80_000,  minOpcodes: 8 },
  { name: "four_ops",          expression: "1 + 2 * 3 - 4 / 2",           iterations: 60_000,  minOpcodes: 14 },
  { name: "nested_parens",     expression: "(1 + 2) * (3 + 4)",           iterations: 60_000,  minOpcodes: 11 },
  { name: "negation",          expression: "-5 + 10",                      iterations: 80_000,  minOpcodes: 6 },
  { name: "function_call",     expression: "sqrt(144)",                    iterations: 60_000,  minOpcodes: 4 },
  { name: "function_two_args", expression: "pow(2, 8)",                    iterations: 50_000,  minOpcodes: 5 },
  { name: "percentage",        expression: "50% of 200",                   iterations: 50_000,  minOpcodes: 6 },
  { name: "percentage_change", expression: "increase 100 by 10%",          iterations: 40_000,  minOpcodes: 6 },
  { name: "unit_conversion",   expression: "100 cm to m",                  iterations: 40_000,  minOpcodes: 6 },
  { name: "unit_in",           expression: "5 miles in km",                iterations: 40_000,  minOpcodes: 7 },
  { name: "datetime",          expression: "now + 5 days",                 iterations: 30_000,  minOpcodes: 5 },
  { name: "dice",              expression: "roll(1, 20)",                  iterations: 30_000,  minOpcodes: 5 },
  { name: "vector",            expression: "vec3(1, 2, 3)",                iterations: 30_000,  minOpcodes: 5 },
  { name: "variable_assign",   expression: ":x = 42",                      iterations: 60_000,  minOpcodes: 4 },
  { name: "variable_ref",      expression: ":x + 10",                      iterations: 60_000,  minOpcodes: 5 },
  { name: "mixed_complex",     expression: "sqrt(144) + 50% of 200 - 3 * (10 + 5)", iterations: 20_000, minOpcodes: 20 },
  { name: "bigint_hex",        expression: "0xFF + 0b1010",                iterations: 50_000,  minOpcodes: 5 },
];

// ── Result Types ──────────────────────────────────────────────────────────

interface ParseCompileResult {
  name: string;
  /** Parse+compile mean in nanoseconds */
  meanNs: number;
  /** Parse+compile P95 in nanoseconds */
  p95Ns: number;
  /** Parse+compile mean in microseconds */
  meanUs: number;
  /** Operations per microsecond (higher = faster) */
  opsPerUs: number;
  /** Bytecode: number of opcodes emitted */
  opcodeCount: number;
  /** Bytecode: number of number constants emitted */
  numbersCount: number;
  /** Bytecode: number of unique string constants */
  stringsCount: number;
  /** Token count (pre-lexed, not timed) */
  tokenCount: number;
  /** Total samples */
  iterations: number;
}

interface ParseCompileResults {
  timestamp: string;
  results: Record<string, Omit<ParseCompileResult, "name">>;
  summary: {
    meanUs: number;
    minUs: number;
    maxUs: number;
    meanOpcodesPerExpr: number;
  };
  metadata: {
    nodeVersion: string;
    platform: string;
    totalExpressions: number;
    description: string;
  };
}

// ── Benchmark Suite ───────────────────────────────────────────────────────

describe("Parse+Compile Micro-Benchmarks", () => {
  const results: ParseCompileResults = {
    timestamp: "",
    results: {},
    summary: { meanUs: 0, minUs: 0, maxUs: 0, meanOpcodesPerExpr: 0 },
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      totalExpressions: EXPRESSIONS.length,
      description:
        "Isolated parse+compile phase (Parser + BytecodeBuilder). " +
        "Lexing is done once before measurement. No VM execution. " +
        "Uses pooled BytecodeBuilder (4 instances) and pre-allocated buffer pool " +
        "(1024 opcodes, 256 numbers) — mirrors ExpressionEngine hot path exactly.",
    },
  };

  afterAll(() => {
    results.timestamp = new Date().toISOString();

    const allMeans = Object.values(results.results).map((r) => r.meanUs);
    const allOpcodes = Object.values(results.results).map((r) => r.opcodeCount);
    results.summary.meanUs =
      allMeans.reduce((a, b) => a + b, 0) / allMeans.length;
    results.summary.minUs = Math.min(...allMeans);
    results.summary.maxUs = Math.max(...allMeans);
    results.summary.meanOpcodesPerExpr =
      allOpcodes.reduce((a, b) => a + b, 0) / allOpcodes.length;

    // ── Console table ──
    const hdrExpr = "Expression";
    const hdrUs = "us/op";
    const hdrOps = "ops/us";
    const hdrTok = "Tokens";
    const hdrOpc = "Opcodes";
    const hdrNum = "Nums";
    const hdrStr = "Strs";
    const hdrItr = "Iters";

    console.log("\n" + "=".repeat(100));
    console.log("  PARSE+COMPILE MICRO-BENCHMARKS");
    console.log("  Isolated Parser + BytecodeBuilder phase (no lexing, no VM)");
    console.log("=".repeat(100));
    console.log("  Node: " + results.metadata.nodeVersion + "  Platform: " + results.metadata.platform);
    console.log("  Expressions: " + EXPRESSIONS.length + "  Pool: 4 builders, buffer: 1024/256");
    console.log("=".repeat(100));

    console.log(
      "\n  " +
      hdrExpr.padEnd(18) + " " +
      hdrUs.padStart(8) + " " +
      hdrOps.padStart(8) + " " +
      hdrTok.padStart(8) + " " +
      hdrOpc.padStart(6) + " " +
      hdrNum.padStart(6) + " " +
      hdrStr.padStart(6) + " " +
      hdrItr.padStart(8)
    );
    console.log("  " + "-".repeat(78));

    for (const key of Object.keys(results.results)) {
      const r = results.results[key];
      const name = key;
      console.log(
        "  " +
        name.padEnd(18) + " " +
        r.meanUs.toFixed(3).padStart(8) + " " +
        r.opsPerUs.toFixed(2).padStart(8) + " " +
        String(r.tokenCount).padStart(8) + " " +
        String(r.opcodeCount).padStart(6) + " " +
        String(r.numbersCount).padStart(6) + " " +
        String(r.stringsCount).padStart(6) + " " +
        String(r.iterations).padStart(8)
      );
    }

    console.log("  " + "-".repeat(78));
    console.log("\n  Summary:");
    console.log("    Mean parse+compile : " + results.summary.meanUs.toFixed(3) + " us/expr");
    console.log("    Min  parse+compile : " + results.summary.minUs.toFixed(3) + " us/expr");
    console.log("    Max  parse+compile : " + results.summary.maxUs.toFixed(3) + " us/expr");
    console.log("    Mean opcodes/expr  : " + results.summary.meanOpcodesPerExpr.toFixed(1));
    console.log("    Total expressions  : " + results.metadata.totalExpressions);
    console.log("\n" + "=".repeat(100) + "\n");

    // ── Save to baseline JSON ──
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "parse-compile-baseline.json"),
      JSON.stringify(results, null, 2)
    );
  });

  // ── Shared resources (created once per suite) ──
  const parser = createConfiguredParser();
  const builderPool: BytecodeBuilder[] = [
    new BytecodeBuilder(),
    new BytecodeBuilder(),
    new BytecodeBuilder(),
    new BytecodeBuilder(),
  ];
  // Pre-allocated buffer pool (reused across all iterations — mirrors ExpressionEngine)
  const bufferPool = {
    opcodes: new Uint8Array(1024),
    numbers: new Float64Array(256),
  };

  for (const expr of EXPRESSIONS) {
    test(`parse+compile "${expr.name}" (${expr.expression})`, () => {
      // Pre-tokenize — NOT timed
      const tokens = tokenize(expr.expression);
      // Per-test builder pool index (reset for each expression)
      let poolIdx = 0;

      const result = timeParseCompileNs(
        () => {
          const builder = builderPool[poolIdx++ % builderPool.length];
          builder.reset();
          parser.load(tokens);
          parser.parseExpression(0, builder);
          const program = builder.buildInto(bufferPool);
          // Touch result to prevent dead-code elimination
          if (program.opcodes.length > 0) void program.opcodes[0];
          if (program.numbers.length > 0) void program.numbers[0];
          return program;
        },
        expr.iterations,
      );

      // Sanity check: bytecode should have at least the expected minimum opcodes
      expect(result.bytecodeSize).toBeGreaterThanOrEqual(expr.minOpcodes);

      const meanUs = result.meanNs / 1000;

      results.results[expr.name] = {
        meanNs: result.meanNs,
        p95Ns: result.p95Ns,
        meanUs,
        opsPerUs: 1 / meanUs,
        opcodeCount: result.bytecodeSize,
        numbersCount: result.numbersSize,
        stringsCount: result.stringsSize,
        tokenCount: tokens.length,
        iterations: expr.iterations,
      };
    });
  }
});
