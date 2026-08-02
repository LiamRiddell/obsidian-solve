/**
 * VM Execution Benchmarks - Jest compatible
 * Measures bytecode execution performance using pre-built bytecodes.
 * This isolates VM performance from parsing overhead.
 *
 * NOTE: The benchmark reuses a single VM instance across iterations
 * (reset() instead of createVM() each time) to eliminate allocation
 * and GC noise from the measurement. This reflects the production
 * usage pattern where ExpressionEngine keeps a persistent VM.
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { OpCode } from "@solve-js/parser/OpCode";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";

interface BytecodeProgram {
  opcodes: Uint8Array;
  numbers: Float64Array;
  strings: string[];
}

function makeBytecode(opcodes: number[], numbers: number[] = [], strings: string[] = []): BytecodeProgram {
  return {
    opcodes: new Uint8Array(opcodes),
    numbers: new Float64Array(numbers),
    strings,
  };
}

const programs: Array<{ name: string; bytecode: BytecodeProgram }> = [
  // Simple: 1 + 2 → PUSH 1, PUSH 2, ADD, HALT
  {
    name: "simple_add",
    bytecode: makeBytecode([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.ADD, OpCode.HALT], [1, 2]),
  },
  // Variable: STORE + LOAD + ADD
  {
    name: "variable_access",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.STORE_VAR, 0, OpCode.PUSH_NUMBER, 1, OpCode.LOAD_VAR, 0, OpCode.ADD, OpCode.HALT],
      [42, 0],
      ["x"]
    ),
  },
  // Vector: vec3(1, 2, 3)
  {
    name: "vector_creation",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.PUSH_NUMBER, 2, OpCode.MAT_NEW, 1, 3, OpCode.HALT],
      [1, 2, 3]
    ),
  },
  // Unit conversion: 100 cm to m
  {
    name: "unit_conversion",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 0, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT_TO, OpCode.HALT],
      [100],
      ["cm", "m"]
    ),
  },
  // Dice: roll(1, 6)
  {
    name: "dice_roll",
    bytecode: makeBytecode([OpCode.PUSH_NUMBER, 0, OpCode.PUSH_NUMBER, 1, OpCode.CALL_BUILTIN, 37, 2, OpCode.HALT], [1, 6]),
  },
  // Percentage: 50% of 200
  {
    name: "percentage",
    bytecode: makeBytecode(
      [OpCode.PUSH_NUMBER, 0, OpCode.TO_PERCENTAGE, OpCode.PUSH_NUMBER, 1, OpCode.MUL, OpCode.HALT],
      [50, 200]
    ),
  },
];

describe("VM Benchmarks", () => {
  const results: Record<string, number> = {};

  afterAll(() => {
    console.log("\n📊 VM BENCHMARK RESULTS (mean µs, isolated VM execution):");
    console.log(`${"Benchmark".padEnd(26)} ${"Mean (µs)".padStart(12)} ${"Ops/sec".padStart(12)}`);
    console.log(`${"─".repeat(52)}`);
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const [name, mean] of Object.entries(results)) {
      const ops = 1_000_000 / mean;
      console.log(`${name.padEnd(26)} ${mean.toFixed(2).padStart(12)} ${ops.toFixed(0).padStart(12)}`);
    }
    fs.writeFileSync(
      path.join(dir, "vm-baseline.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
    );
  });

  for (const { name, bytecode } of programs) {
    test(`executes "${name}" efficiently`, () => {
      // Reuse a single VM across all iterations — matches production pattern
      // where ExpressionEngine keeps a persistent VM. Eliminates allocation
      // and GC noise from the measurement.
      const vm = createVM(sharedOpRegistry);
      let totalMs = 0;
      const batches = 5;
      const perBatch = 5000;

      for (let b = 0; b < batches; b++) {
        const start = performance.now();
        for (let i = 0; i < perBatch; i++) {
          vm.reset();
          executeBytecode(bytecode, vm);
        }
        totalMs += performance.now() - start;
      }

      const meanMs = totalMs / (batches * perBatch);
      const meanUs = meanMs * 1000;
      results[name] = meanUs;

      // Simple VM ops should be well under 1ms (1000µs)
      expect(meanUs).toBeLessThan(500);
    });
  }
});
