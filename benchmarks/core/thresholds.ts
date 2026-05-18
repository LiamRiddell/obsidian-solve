/**
  * Benchmark Threshold Configuration
  *
  * Defines acceptable performance thresholds.
  * When a benchmark exceeds its threshold in CI mode, the build fails.
  */

import type { BenchmarkResult } from "./StatRunner";

export interface ThresholdConfig {
  /** Benchmark name pattern to match */
  name: string;
  /** Maximum allowed mean time in milliseconds */
  maxMeanMs: number;
  /** Maximum allowed multiplier relative to baseline (e.g., 2.0 = 2× slower = FAIL) */
  maxMultiplier?: number;
}

/**
 * Performance thresholds — adjust these as benchmarks are established.
 * These are generous initial values that will be tightened as optimizations land.
 */
export const THRESHOLDS: ThresholdConfig[] = [
  // Lexer benchmarks
  { name: "lexer:simple_arithmetic", maxMeanMs: 0.1 },
  { name: "lexer:unicode_math", maxMeanMs: 0.1 },
  { name: "lexer:keywords", maxMeanMs: 0.1 },
  { name: "lexer:mixed_expression", maxMeanMs: 0.2 },
  { name: "lexer:long_expression", maxMeanMs: 1.0 },
  { name: "lexer:inline_solve", maxMeanMs: 0.1 },
  { name: "lexer:full_markdown_line", maxMeanMs: 0.3 },

  // Parser benchmarks
  { name: "parser:simple_arithmetic", maxMeanMs: 0.2 },
  { name: "parser:complex_expression", maxMeanMs: 0.5 },
  { name: "parser:function_call", maxMeanMs: 0.3 },

  // VM benchmarks
  { name: "vm:simple_add", maxMeanMs: 0.05 },
  { name: "vm:function_call", maxMeanMs: 0.1 },
  { name: "vm:variable_access", maxMeanMs: 0.05 },

  // Pipeline benchmarks
  { name: "pipeline:single_eval_cold", maxMeanMs: 1.0 },
  { name: "pipeline:single_eval_warm", maxMeanMs: 0.1 },
  { name: "pipeline:100_line_doc", maxMeanMs: 50 },
  { name: "pipeline:variable_chain", maxMeanMs: 1.0 },

  // Max multipliers — anything exceeding these is a regression
  { name: "*", maxMeanMs: 1000, maxMultiplier: 3.0 },
];

/**
 * Check benchmark results against thresholds.
 * Returns list of violation messages (empty = all passed).
 */
export function checkThresholds(
  results: Map<string, BenchmarkResult>,
  thresholds: ThresholdConfig[] = THRESHOLDS
): string[] {
  const violations: string[] = [];

  for (const config of thresholds) {
    if (config.name === "*") {
      // Wildcard threshold — applies to all benchmarks
      for (const [, result] of results) {
        if (config.maxMeanMs && result.mean > config.maxMeanMs) {
          violations.push(`${result.name}: mean ${result.mean.toFixed(3)}ms exceeds ${config.maxMeanMs}ms`);
        }
      }
      continue;
    }

    // Exact match
    const result = results.get(config.name);
    if (!result) continue;

    if (config.maxMeanMs && result.mean > config.maxMeanMs) {
      violations.push(`${config.name}: mean ${result.mean.toFixed(3)}ms exceeds ${config.maxMeanMs}ms`);
    }

    if (config.maxMultiplier) {
      // Would need baseline to check multiplier — handled in comparison mode
    }
  }

  return violations;
}

export type { BenchmarkResult } from "./StatRunner";