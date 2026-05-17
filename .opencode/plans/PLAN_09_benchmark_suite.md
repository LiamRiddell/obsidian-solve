# IMPLEMENTATION PLAN: Add Benchmark Suite

## GAP 3.4.1: No Performance Tests — Zero benchmark tests for parsing/execution speed
**File(s)**: New file: `benchmarks/` directory, test files in `src/solve-js/__tests__/benchmarks/`

## Problem
There is zero performance testing. No measurement of parsing speed, execution speed, memory usage, or regression detection. Cannot answer "is this change faster or slower?"

## Implementation Steps

### Step 1: Create benchmark infrastructure (2 hours)
- [ ] New file: `benchmarks/core/StatRunner.ts`
  - Runs a function N times, discards warmup iterations
  - Calculates: mean, median, p50, p95, p99, stddev, min, max
  - Returns results in structured format
- [ ] New file: `benchmarks/core/BenchmarkSuite.ts`
  - Groups related benchmarks
  - Runs suite and outputs summary table
  - Stores historical results for regression detection
- [ ] New file: `benchmarks/core/thresholds.ts`
  - Defines acceptable performance thresholds
  - Format: `{ name: string, baselineMs: number, maxMultiplier: number }`

### Step 2: Create Lexer Benchmarks (1.5 hours)
- [ ] New file: `benchmarks/lexerBenchmarks.ts`
- [ ] Benchmark cases:
  ```typescript
  const cases = [
    { name: 'simple arithmetic', input: '1 + 2 * 3', iterations: 10000 },
    { name: 'unicode math', input: '3 × 4 ÷ 2', iterations: 10000 },
    { name: 'keywords', input: 'increase 100 by 10%', iterations: 10000 },
    { name: 'mixed expression', input: '$10 + 50% of 200 - 3 kg', iterations: 5000 },
    { name: 'long expression', input: Array(50).fill('1+1').join(' + '), iterations: 1000 },
    { name: 'markdown line with inline solve', input: 's`1 + 2` and some text', iterations: 10000 },
    { name: 'full markdown line', input: '# Heading with s`3 + 4` inline', iterations: 5000 },
  ];
  ```
- [ ] For each case:
  - Warmup (100 iterations)
  - Measure: lexer only (don't parse or execute)
  - Report: tokens/ms

### Step 3: Create Parser/Bytecode Benchmarks (1.5 hours)
- [ ] New file: `benchmarks/parserBenchmarks.ts`
- [ ] Benchmark cases using same inputs as lexer
- [ ] Measure: full parse + bytecode build time
- [ ] Additional: measure with and without bytecode cache (once implemented)

### Step 4: Create VM Execution Benchmarks (1.5 hours)
- [ ] New file: `benchmarks/vmBenchmarks.ts`
- [ ] Benchmark cases:
  ```typescript
  const cases = [
    { name: 'simple add', bytecodes: [PUSH_NUMBER, 0, PUSH_NUMBER, 1, ADD, HALT], numbers: [1, 2], iterations: 100000 },
    { name: 'complex expression', /* pre-built bytecodes for: (1+2*3^2)/4 */ iterations: 50000 },
    { name: 'function call', /* sqrt(144) */ iterations: 50000 },
    { name: 'vector creation', /* vec3(1,2,3) */ iterations: 50000 },
    { name: 'unit conversion', /* 100 cm to m */ iterations: 30000 },
    { name: 'variable access', /* LOAD_VAR x */ iterations: 100000 },
    { name: 'dice roll', /* roll(1, 6) */ iterations: 20000 },
  ];
  ```

### Step 5: Create Full Pipeline Benchmarks (2 hours)
- [ ] New file: `benchmarks/fullPipelineBenchmarks.ts`
- [ ] Uses complete `ExpressionEngine` — lexer + parser + VM + cache
- [ ] Benchmark cases:
  ```typescript
  const cases = [
    // Single expression evaluation (cold cache)
    { name: 'single eval (cold)', input: '1 + 2', iterations: 10000 },
    // Single expression evaluation (warm cache)
    { name: 'single eval (warm)', input: '3 + 4', setup: /* eval once to warm */, iterations: 10000 },
    // Multi-line document
    { name: '100-line doc', input: generateDoc(100), iterations: 100 },
    { name: '1000-line doc', input: generateDoc(1000), iterations: 10 },
    // Variable dependency
    { name: 'variable chain', input: ':x = 1
:x + 1
:x + 2', iterations: 1000 },
    // Inline solves in text
    { name: '50 inline solves', input: generateInlineDoc(50), iterations: 100 },
    // Re-evaluation (dirty propagation)
    { name: 're-eval dirty', setup: /* eval doc, change var */, iterations: 100 },
  ];
  ```

### Step 6: Create Comparison/Benchmark Runner (1 hour)
- [ ] Add option to compare two versions: `--compare`
- [ ] Useful for comparing branch vs main
- [ ] Output: percentage change table

### Step 7: Add regression detection (1 hour)
- [ ] Store results in `benchmarks/results/benchmarks.json`
- [ ] On each run, compare against stored baseline
- [ ] Fail if any benchmark exceeds threshold (e.g., >2x slower)
- [ ] Add `--ci` flag for automated regression detection

### Step 8: Integrate with CI (1 hour)
- [ ] Add `npm run bench` script
- [ ] Optionally run benchmarks in CI (GitHub Actions)
- [ ] Upload results as artifacts
- [ ] Comment on PRs with performance changes

### Step 9: Write tests for benchmark infrastructure (1 hour)
- [ ] Test: StatRunner calculates correct statistics
- [ ] Test: BenchmarkSuite groups and runs correctly
- [ ] Test: Threshold detection works (pass/fail)

## Acceptance Criteria
- [ ] `npm run bench` runs all benchmarks and outputs a formatted table
- [ ] At least 5 lexer benchmarks, 5 parser benchmarks, 5 VM benchmarks, 5 pipeline benchmarks
- [ ] Results stored for regression comparison
- [ ] Threshold violations cause build failure in CI
- [ ] Performance of existing features is documented (baseline numbers)

## Risk Level: Low
## Estimated Time: 12-15 hours

## Notes
- Use `performance.now()` for timing (not `Date.now()`)
- Run each benchmark in a fresh VM/Engine instance for isolation
- Consider using `benchmark.js` library if you don't want to build from scratch
- The benchmark infrastructure itself should be tested — a buggy benchmark is worse than no benchmark