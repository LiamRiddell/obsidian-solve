/**
 * Lexer Benchmarks - Jest compatible
 * Measures tokenization performance across different expression types.
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { benchmarkFn } from "@tools/testUtils";

describe("Lexer Benchmarks", () => {
  const results: Record<string, number> = {};

  afterAll(() => {
    console.log("\n📊 LEXER BENCHMARK RESULTS (mean ms, higher iterations = more accurate):");
    console.log(`${"Benchmark".padEnd(30)} ${"Mean (ms)".padStart(12)} ${"Ops/sec".padStart(12)}`);
    console.log(`${"─".repeat(56)}`);
    for (const [name, mean] of Object.entries(results)) {
      const ops = 1000 / mean;
      console.log(`${name.padEnd(30)} ${mean.toFixed(6).padStart(12)} ${ops.toFixed(0).padStart(12)}`);
    }
    // Save to file for comparison
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "lexer-baseline.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
    );
  });

  const cases = [
    { name: "simple_arithmetic", input: "1 + 2 * 3", iters: 50000 },
    { name: "unicode_math", input: "3 × 4 ÷ 2", iters: 50000 },
    { name: "keywords", input: "increase 100 by 10%", iters: 50000 },
    { name: "mixed_expression", input: "$10 + 50% of 200 - 3 kg", iters: 25000 },
    { name: "long_expression", input: Array(50).fill("1+1").join(" + "), iters: 5000 },
    { name: "inline_solve_in_text", input: "s`1 + 2` and some text", iters: 20000 },
    { name: "full_markdown_line", input: "# Heading with s`3 + 4` inline", iters: 10000 },
    { name: "empty_string", input: "", iters: 50000 },
    { name: "number_only", input: "42", iters: 50000 },
    { name: "variable_ref", input: ":x", iters: 50000 },
    { name: "function_call", input: "sqrt(144)", iters: 50000 },
    { name: "complex_unit", input: "100 km/h to m/s", iters: 25000 },
    { name: "datetime", input: "now + 5 days", iters: 25000 },
    { name: "dice_roll", input: "roll(1, 20)", iters: 25000 },
    { name: "vector", input: "vec3(1, 2, 3)", iters: 25000 },
  ];

  for (const c of cases) {
    test(`lexes "${c.name}" (${c.iters.toLocaleString()} iter)`, () => {
      const lexer = new Lexer("en");
      const r = benchmarkFn(() => {
        lexer.reset(c.input);
        for (const _ of lexer) { /* consume all tokens */ }
      }, c.iters, Math.min(100, Math.floor(c.iters / 10)));
      results[c.name] = r.meanMs;
      // Performance assertion: each lex should be under 1ms for these inputs
      expect(r.meanMs).toBeLessThan(2);
    });
  }
});