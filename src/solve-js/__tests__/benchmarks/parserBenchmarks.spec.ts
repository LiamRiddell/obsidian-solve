/**
 * Parser & Bytecode Benchmarks - Jest compatible
 * Measures parsing + bytecode compilation performance.
 *
 * Uses a fully configured ParseletRegistry (same as ExpressionEngine).
 */

import { describe, expect, test, afterAll } from "@jest/globals";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { Lexer } from "@solve-js/lexer/Lexer";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";

// Import all provider registration functions
import { registerArithmeticParselets } from "@solve-js/providers/arithmetic/parselets/index";
import { registerPercentageParselets } from "@solve-js/providers/percentage/parselets/index";
import { registerFunctionParselets } from "@solve-js/providers/function/parselets/index";
import { registerDatetimeParselets } from "@solve-js/providers/datetime/parselets/index";
import { registerDiceParselets } from "@solve-js/providers/dice/parselets/index";
import { registerVariableParselets } from "@solve-js/providers/variables/parselets/index";
import { registerUomParselets } from "@solve-js/providers/uom/parselets/index";
import { registerVectorParselets } from "@solve-js/providers/vector/parselets/index";
import { registerBigIntParselets } from "@solve-js/providers/biginteger/parselets/index";

function createConfiguredParser(): Parser {
  const registry = new ParseletRegistry();
  registerArithmeticParselets(registry);
  registerPercentageParselets(registry);
  registerFunctionParselets(registry);
  registerDatetimeParselets(registry);
  registerDiceParselets(registry);
  registerVariableParselets(registry);
  registerUomParselets(registry);
  registerVectorParselets(registry);
  registerBigIntParselets(registry);
  return new Parser(registry);
}

function tokenize(input: string) {
  const lexer = new Lexer("en");
  lexer.reset(input);
  return Array.from(lexer).filter(
    (t) => t.type !== "WS" && t.type !== "NEWLINE" && !t.type.startsWith("MD_")
  );
}

describe("Parser Benchmarks", () => {
  const results: Record<string, number> = {};

  afterAll(() => {
    console.log("\n📊 PARSER BENCHMARK RESULTS (mean ms):");
    console.log(`${"Benchmark".padEnd(30)} ${"Mean (ms)".padStart(12)} ${"Ops/sec".padStart(12)}`);
    console.log(`${"─".repeat(56)}`);
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "..", "..", "benchmarks", "results");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const [name, mean] of Object.entries(results)) {
      const ops = 1000 / mean;
      console.log(`${name.padEnd(30)} ${mean.toFixed(6).padStart(12)} ${ops.toFixed(0).padStart(12)}`);
    }
    fs.writeFileSync(
      path.join(dir, "parser-baseline.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
    );
  });

  const cases = [
    { name: "simple_arithmetic", input: "1 + 2 * 3", batches: 10, perBatch: 2500 },
    { name: "complex_expression", input: "(1 + 2 * 3 ^ 2) / 4", batches: 10, perBatch: 2500 },
    { name: "function_call", input: "sqrt(144)", batches: 10, perBatch: 2500 },
    { name: "percentage", input: "50% of 200", batches: 10, perBatch: 2500 },
    { name: "unit_conversion", input: "100 cm to m", batches: 10, perBatch: 2500 },
    { name: "datetime", input: "now + 5 days", batches: 10, perBatch: 2500 },
    { name: "dice", input: "roll(1, 20)", batches: 10, perBatch: 2500 },
    { name: "vector", input: "vec3(1, 2, 3)", batches: 10, perBatch: 2500 },
    { name: "variable", input: ":x = 42", batches: 10, perBatch: 2500 },
    { name: "mixed", input: "$10 + 50% of 200 - 3 kg", batches: 3, perBatch: 1000 },
  ];

  for (const c of cases) {
    test(`parses "${c.name}" efficiently`, () => {
      const tokens = tokenize(c.input);
      let totalMs = 0;

      for (let b = 0; b < c.batches; b++) {
        const start = performance.now();
        for (let i = 0; i < c.perBatch; i++) {
          const p = createConfiguredParser();
          // Parser (PrecedenceParser) emits opcodes into a BytecodeBuilder —
          // parselets read `this.builder` internally, so it must be set
          // before parseExpression() runs (mirrors ExpressionEngine's own
          // private parseExpression() helper).
          p.setBuilder(new BytecodeBuilder());
          p.load(tokens);
          p.parseExpression(0);
        }
        totalMs += performance.now() - start;
      }

      const meanMs = totalMs / (c.batches * c.perBatch);
      results[c.name] = meanMs;
      expect(meanMs).toBeLessThan(5);
    });
  }
});