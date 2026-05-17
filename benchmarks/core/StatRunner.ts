/**
 * Statistical Benchmark Runner
 * 
 * Runs a function N times, discards warmup iterations,
 * and calculates comprehensive statistics.
 * 
 * Uses performance.now() for nanosecond-resolution timing.
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  warmupIterations: number;
  times: number[];        // raw times in milliseconds (after warmup)
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSecond: number;   // throughput
  bytesAllocated?: number; // optional heap measurement
}

export class StatRunner {
  /**
   * Run a benchmark function with statistical rigor.
   * 
   * @param name - Benchmark name for identification
   * @param fn - The function to benchmark (called once per iteration)
   * @param options - Configuration options
   * @returns Comprehensive benchmark result
   */
  static run(
    name: string,
    fn: () => void,
    options: {
      iterations?: number;       // Total iterations (including warmup)
      warmupIterations?: number; // Iterations to discard
      setup?: () => void;        // Called before each iteration
      teardown?: () => void;     // Called after each iteration
    } = {}
  ): BenchmarkResult {
    const iterations = options.iterations ?? 10000;
    const warmupIterations = options.warmupIterations ?? Math.min(100, Math.floor(iterations * 0.1));
    const actualMeasured = iterations - warmupIterations;

    // Warmup phase — let V8 optimize the function
    for (let i = 0; i < warmupIterations; i++) {
      if (options.setup) options.setup();
      fn();
      if (options.teardown) options.teardown();
    }

    // Measurement phase
    const times: number[] = new Array(actualMeasured);
    for (let i = 0; i < actualMeasured; i++) {
      if (options.setup) options.setup();
      const start = performance.now();
      fn();
      const end = performance.now();
      if (options.teardown) options.teardown();
      times[i] = end - start;
    }

    // Calculate statistics
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const mean = sum / actualMeasured;
    const median = sorted[Math.floor(actualMeasured / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    // Standard deviation (population)
    const variance = times.reduce((acc, t) => acc + (t - mean) ** 2, 0) / actualMeasured;
    const stddev = Math.sqrt(variance);

    // Percentiles
    const percentile = (sorted: number[], p: number): number => {
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return sorted[lower];
      return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
    };

    return {
      name,
      iterations: actualMeasured,
      warmupIterations,
      times,
      mean,
      median,
      min,
      max,
      stddev,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      opsPerSecond: (1000 / mean),
    };
  }

  /**
   * Run multiple benchmarks and return all results.
   */
  static runSuite(
    benchmarks: Array<{
      name: string;
      fn: () => void;
      iterations?: number;
      warmupIterations?: number;
      setup?: () => void;
      teardown?: () => void;
    }>
  ): BenchmarkResult[] {
    return benchmarks.map((b) =>
      StatRunner.run(b.name, b.fn, {
        iterations: b.iterations,
        warmupIterations: b.warmupIterations,
        setup: b.setup,
        teardown: b.teardown,
      })
    );
  }

  /**
   * Compare two benchmark results and compute percentage change.
   */
  static compare(base: BenchmarkResult, current: BenchmarkResult): {
    name: string;
    baseMean: number;
    currentMean: number;
    changePercent: number;
    faster: boolean;
  } {
    const changePercent = ((current.mean - base.mean) / base.mean) * 100;
    return {
      name: current.name,
      baseMean: base.mean,
      currentMean: current.mean,
      changePercent,
      faster: changePercent < 0,
    };
  }
}