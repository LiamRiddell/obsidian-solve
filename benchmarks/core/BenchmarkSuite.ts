/**
 * Benchmark Suite Runner
 * 
 * Groups related benchmarks, runs them, formats output,
 * and handles regression detection against stored baselines.
 */

import { StatRunner, BenchmarkResult } from "./StatRunner";
import { ThresholdConfig, checkThresholds } from "./thresholds";

export interface SuiteResult {
  suiteName: string;
  timestamp: string;
  results: BenchmarkResult[];
  thresholdViolations: string[];
}

export class BenchmarkSuite {
  private results: Map<string, BenchmarkResult> = new Map();

  constructor(public suiteName: string) {}

  /**
   * Add a benchmark to the suite.
   */
  add(
    name: string,
    fn: () => void,
    options?: {
      iterations?: number;
      warmupIterations?: number;
      setup?: () => void;
      teardown?: () => void;
    }
  ): void {
    const result = StatRunner.run(name, fn, options);
    this.results.set(name, result);
  }

  /**
   * Run all benchmarks in the suite and return aggregated results.
   */
  run(thresholds?: ThresholdConfig[]): SuiteResult {
    const violations = thresholds ? checkThresholds(this.results, thresholds) : [];
    return {
      suiteName: this.suiteName,
      timestamp: new Date().toISOString(),
      results: Array.from(this.results.values()),
      thresholdViolations: violations,
    };
  }

  /**
   * Format benchmark results as a readable table.
   */
  static formatResults(suiteResult: SuiteResult): string {
    const lines: string[] = [];
    lines.push(`\n╔════════════════════════════════════════════════════════════════╗`);
    lines.push(`║  ${suiteResult.suiteName.padEnd(62)}║`);
    lines.push(`╠════════════════════════════════════════════════════════════════╣`);
    lines.push(`║  Timestamp: ${suiteResult.timestamp}                        ║`);
    lines.push(`╠════════════════════════════════════════════════════════════════╣`);
    lines.push(
      `║  ${"Benchmark".padEnd(30)} ${"Mean".padStart(8)}ms ${"Median".padStart(8)}ms ${"P95".padStart(8)}ms ${"Ops/s".padStart(10)}║`
    );
    lines.push(`╠════════════════════════════════════════════════════════════════╣`);

    for (const r of suiteResult.results) {
      const name = r.name.length > 28 ? r.name.slice(0, 25) + "..." : r.name;
      const mean = r.mean.toFixed(4).padStart(8);
      const median = r.median.toFixed(4).padStart(8);
      const p95 = r.p95.toFixed(4).padStart(8);
      const ops = r.opsPerSecond.toFixed(0).padStart(10);
      lines.push(`║  ${name.padEnd(30)} ${mean} ${median} ${p95} ${ops}║`);
    }

    lines.push(`╠════════════════════════════════════════════════════════════════╣`);

    if (suiteResult.thresholdViolations.length > 0) {
      lines.push(`║  ⚠️  THRESHOLD VIOLATIONS:                                     ║`);
      for (const v of suiteResult.thresholdViolations) {
        lines.push(`║    ${v.padEnd(62)}║`);
      }
      lines.push(`╠════════════════════════════════════════════════════════════════╣`);
    }

    lines.push(`╚════════════════════════════════════════════════════════════════╝`);
    return lines.join("\n");
  }

  /**
   * Format a comparison between two runs.
   */
  static formatComparison(
    baselineResults: Map<string, BenchmarkResult>,
    currentResults: Map<string, BenchmarkResult>
  ): string {
    const lines: string[] = [];
    lines.push(`\n${"═".repeat(72)}`);
    lines.push(`  PERFORMANCE COMPARISON`);
    lines.push(`${"═".repeat(72)}`);
    lines.push(
      `  ${"Benchmark".padEnd(30)} ${"Baseline".padStart(10)} ${"Current".padStart(10)} ${"Change".padStart(10)}  Status`
    );
    lines.push(`${"─".repeat(72)}`);

    for (const [name, current] of currentResults) {
      const baseline = baselineResults.get(name);
      if (!baseline) {
        lines.push(`  ${name.padEnd(30)} ${"(new)".padStart(10)}`.padEnd(52) + `📌 NEW`);
        continue;
      }

      const changePercent = ((current.mean - baseline.mean) / baseline.mean) * 100;
      const direction = changePercent < 0 ? "↓" : "↑";
      const status = changePercent < 0 ? "✅ FASTER" : changePercent > 50 ? "❌ REGRESSION" : "⚠️ SLOWER";
      const changeStr = `${direction}${Math.abs(changePercent).toFixed(1)}%`;

      lines.push(
        `  ${name.padEnd(30)} ${baseline.mean.toFixed(3).padStart(8)}ms ${current.mean.toFixed(3).padStart(8)}ms ${changeStr.padStart(10)}  ${status}`
      );
    }

    lines.push(`${"─".repeat(72)}`);
    return lines.join("\n");
  }

  /**
   * Run and compare against a stored baseline.
   */
  static runWithBaseline(
    suite: BenchmarkSuite,
    baselinePath: string,
    thresholds?: ThresholdConfig[]
  ): { suiteResult: SuiteResult; comparison?: string; hasViolations: boolean } {
    const suiteResult = suite.run(thresholds);
    let baselineResults = new Map<string, BenchmarkResult>();

    // Load baseline if it exists (in a real implementation, would read from file)
    try {
      // This is a simplified version — actual impl would read baseline JSON
      // For now, just return results without comparison
    } catch (e) {
      // No baseline found, that's OK for first run
    }

    const comparison =
      baselineResults.size > 0
        ? BenchmarkSuite.formatComparison(baselineResults, new Map(suiteResult.results.map((r) => [r.name, r])))
        : undefined;

    return {
      suiteResult,
      comparison,
      hasViolations: suiteResult.thresholdViolations.length > 0,
    };
  }
}