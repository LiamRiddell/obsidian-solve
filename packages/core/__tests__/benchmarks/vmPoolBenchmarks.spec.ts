/**
 * VM Instance Pooling Benchmarks
 *
 * Measures the VM execution performance impact of VM instance pooling.
 * Compares `createVM()` per expression (before) against pooled VM reuse with
 * `vm.reset()` between expressions (after). Eliminates 2 heap allocations per
 * expression: the stack array and the variables Map.
 *
 * Design:
 *   - Isolates VM execution from lex/parse phases by using pre-built bytecode
 *   - Reuses the same 6 bytecode programs as vmBenchmarks.spec.ts
 *   - Uses process.hrtime() for nanosecond-precision measurement
 *   - Covers diverse operation types: arithmetic, variables, vectors,
 *     unit conversion, dice rolls, percentage
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { OpCode } from "@solve-js/parser/OpCode";
import { sharedOpRegistry, type VM } from "@solve-js/vm/OpRegistry";

// ──────────────────────────────────────────────
// Pre-built bytecode programs
// ──────────────────────────────────────────────

interface BytecodeProgram {
  opcodes: Uint8Array;
  numbers: Float64Array;
  strings: string[];
}

function makeBytecode(
  opcodes: number[],
  numbers: number[] = [],
  strings: string[] = []
): BytecodeProgram {
  return {
    opcodes: new Uint8Array(opcodes),
    numbers: new Float64Array(numbers),
    strings,
  };
}

const PROGRAMS: Array<{ name: string; bytecode: BytecodeProgram }> = [
  // Simple: 1 + 2 → PUSH 1, PUSH 2, ADD, HALT
  {
    name: "simple_add",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.ADD, OpCode.HALT],
      [1, 2]
    ),
  },
  // Variable: STORE + LOAD + ADD
  {
    name: "variable_access",
    bytecode: makeBytecode(
      [
        OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0,
        OpCode.PUSH_NUMBER, 1, OpCode.LOAD_VAR, 0,
        OpCode.ADD, OpCode.HALT,
      ],
      [42, 0],
      ["x"]
    ),
  },
  // Vector: vec3(1, 2, 3)
  {
    name: "vector_creation",
    bytecode: makeBytecode(
      [
        OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1,
        OpCode.PUSH_NUMBER, 2, OpCode.MAT_NEW, 1, 3, OpCode.HALT,
      ],
      [1, 2, 3]
    ),
  },
  // Unit conversion: 100 cm to m
  {
    name: "unit_conversion",
    bytecode: makeBytecode(
      [
        OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0,
        OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT_TO, OpCode.HALT,
      ],
      [100],
      ["cm", "m"]
    ),
  },
  // Dice: roll(1, 6)
  {
    name: "dice_roll",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 37, 2, OpCode.HALT],
      [1, 6]
    ),
  },
  // Percentage: 50% of 200
  {
    name: "percentage",
    bytecode: makeBytecode(
      [
        OpCode.PUSH_NUMBER, 0, OpCode.TO_PERCENTAGE,
        OpCode.PUSH_NUMBER, 1, OpCode.MUL, OpCode.HALT,
      ],
      [50, 200]
    ),
  },
];

// ──────────────────────────────────────────────
// Timer
// ──────────────────────────────────────────────

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
function timeFnNs(
  fn: () => void,
  iterations: number,
  warmup = 100
): TimerResultNs {
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

interface VmPoolResults {
  timestamp: string;
  summary: {
    meanDeltaNs: number;
    meanPercentImprovement: number;
    /** How many ns the VM allocation (stack[] + Map) costs per expression */
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

describe("VM Instance Pooling Benchmarks", () => {
  const results: VmPoolResults = {
    timestamp: "",
    summary: { meanDeltaNs: 0, meanPercentImprovement: 0, estimatedAllocCostNs: 0 },
    details: [],
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      poolSize: 4,
      description:
        "Measures VM execution phase comparing 'createVM()' (before) vs pooled VM reuse with reset() (after). " +
        "Eliminates 2 heap allocations per expression: stack[] and variables Map. " +
        "Note: ExpressionEngine already uses a single persistent VM — this benchmark " +
        "quantifies the savings for multi-engine or worker-thread scenarios.",
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
    results.summary.estimatedAllocCostNs = results.summary.meanDeltaNs;

    // ── Pretty-print console table ──
    console.log("\n" + "=".repeat(90));
    console.log("  🖥️  VM INSTANCE POOLING BENCHMARK");
    console.log("  Measures VM execution: createVM() vs pooled reuse with reset()");
    console.log("=".repeat(90));
    console.log(
      `  Node: ${results.metadata.nodeVersion}  Platform: ${results.metadata.platform}`
    );
    console.log(
      `  Pool size: ${results.metadata.poolSize} VMs, ${PROGRAMS.length} bytecode programs`
    );
    console.log("=".repeat(90));

    console.log(
      "\n  ┌" +
        "─".repeat(18) +
        "┬" +
        "─".repeat(12) +
        "┬" +
        "─".repeat(12) +
        "┬" +
        "─".repeat(12) +
        "┬" +
        "─".repeat(12) +
        "┬" +
        "─".repeat(12) +
        "┐"
    );
    console.log(
      `  │ ${"Program".padEnd(16)} │ ${"No pool ns".padStart(10)} │ ` +
        `${"Pooled ns".padStart(10)} │ ${"Delta ns".padStart(10)} │ ` +
        `${"Improve%".padStart(10)} │ ${"Speedup".padStart(10)} │`
    );
    console.log(
      "  ├" +
        "─".repeat(18) +
        "┼" +
        "─".repeat(12) +
        "┼" +
        "─".repeat(12) +
        "┼" +
        "─".repeat(12) +
        "┼" +
        "─".repeat(12) +
        "┼" +
        "─".repeat(12) +
        "┤"
    );

    for (const d of results.details) {
      const symbol = d.percentImprovement > 0 ? "✅" : "➖";
      console.log(
        `  │ ${d.name.padEnd(16)} │ ${d.withoutPool.meanNs
          .toFixed(0)
          .padStart(10)} │ ` +
          `${d.withPool.meanNs.toFixed(0).padStart(10)} │ ${d.deltaNs
            .toFixed(0)
            .padStart(10)} │ ` +
          `${d.percentImprovement.toFixed(1).padStart(9)}% │ ${d.speedupRatio
            .toFixed(2)
            .padStart(9)}× │ ` +
          symbol
      );
    }

    console.log(
      "  └" +
        "─".repeat(18) +
        "┴" +
        "─".repeat(12) +
        "┴" +
        "─".repeat(12) +
        "┴" +
        "─".repeat(12) +
        "┴" +
        "─".repeat(12) +
        "┴" +
        "─".repeat(12) +
        "┘"
    );

    console.log("\n  Summary:");
    console.log(
      `    Mean allocation savings : ${results.summary.estimatedAllocCostNs.toFixed(
        0
      )} ns/expr`
    );
    console.log(
      `    Mean improvement        : ${results.summary.meanPercentImprovement.toFixed(
        1
      )}%`
    );
    console.log(`    Pool size               : ${results.metadata.poolSize} VMs`);
    console.log(`    Description: ${results.metadata.description}`);
    console.log("\n" + "=".repeat(90) + "\n");

    // ── Save to baseline JSON ──
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "vm-pool-baseline.json"),
      JSON.stringify(results, null, 2)
    );
  });

  // ── Per-program benchmarks ──

  for (const prog of PROGRAMS) {
    const ITERATIONS = 50_000;

    test(`VM pooling for "${prog.name}"`, () => {
      const bytecode = prog.bytecode;

      // ── WITHOUT POOLING: createVM() per iteration ──
      // Each iteration allocates: stack[], variables Map, closure methods.
      const withoutResult = timeFnNs(
        () => {
          const vm = createVM(sharedOpRegistry);
          executeBytecode(bytecode, vm);
        },
        ITERATIONS
      );

      // ── WITH POOLING: pre-allocate 4 VMs, cycle through them ──
      // Each iteration calls vm.reset() which sets stack.length = 0 and
      // variables.clear() — reuses existing array/Map instead of allocating.
      const pool: VM[] = [
        createVM(sharedOpRegistry),
        createVM(sharedOpRegistry),
        createVM(sharedOpRegistry),
        createVM(sharedOpRegistry),
      ];
      let poolIdx = 0;

      const withResult = timeFnNs(
        () => {
          const vm = pool[poolIdx++ % pool.length];
          vm.reset();
          executeBytecode(bytecode, vm);
        },
        ITERATIONS
      );

      // ── Compute deltas ──
      const deltaNs = withoutResult.meanNs - withResult.meanNs;
      const speedupRatio = withResult.meanNs / withoutResult.meanNs;
      const percentImprovement =
        withoutResult.meanNs > 0
          ? ((withoutResult.meanNs - withResult.meanNs) /
              withoutResult.meanNs) *
            100
          : 0;

      results.details.push({
        name: prog.name,
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
      // Pooling should never be slower (within generous noise tolerance of 25%).
      // Benchmark noise floor is high relative to the small deltas being measured
      // (pooling saves ~100ns/expr), so a tight threshold produces CI flakes.
      expect(withResult.meanNs).toBeLessThanOrEqual(
        withoutResult.meanNs * 1.25
      );
    });
  }
});
