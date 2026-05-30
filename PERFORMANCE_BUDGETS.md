# PERFORMANCE BUDGETS — solve-js

> How fast every component must be. These are not aspirations — they are gates.

## 1. Top-Level Target

**Full pipeline (lex → parse → compile → execute) completes in < 1ms for a single expression.**
**Individual VM operations target nanosecond-level execution.**

---

## 2. Current Performance Baseline (Phase 0 — feat/safety-limits @ 42de5ea)

> Captured: 2026-05-30. 99/99 benchmarks passing. See `benchmarks/results/precedence-climbing-baseline.json` for full data.

### Pipeline Benchmarks (Full Stack)

| Scenario | Mean (ms) | Ops/sec | Notes |
|----------|-----------|---------|-------|
| Single eval (cold) | **0.0334** | **~29,940** | New engine, no cache |
| Single eval (warm) | **0.0014** | **~714,286** | Cached bytecode + shared VM |
| 50-line doc | **0.2253** | **~4,439** | Mixed expressions |
| 200-line doc | **0.7766** | **~1,288** | Full doc parse + eval |
| Variable chain (5 lines) | **0.0390** | **~25,641** | DAG-tracked deps |
| 20 inline solves | **0.1134** | **~8,818** | Inline `s\`...\`` extraction |
| Re-eval dirty line | **0.0335** | **~29,851** | Cached bytecode + VM reset |
| Mixed complex ($ + % + units) | **0.0590** | **~16,949** | Cross-provider |
| Function + literal | **0.0253** | **~39,526** | Builtin function call |

### Stage Breakdown

| Stage | % of Pipeline | Notes |
|-------|:-----:|-------|
| Lex | 33.4% | Position-based line classification |
| Parse + Compile | 57.5% | Heavy — primary optimisation target |
| Execute (VM) | 9.1% | Already near-nanosecond |

### VM Isolated (Pre-Built Bytecode)

| Operation | Mean (µs) | Ops/sec |
|-----------|-----------|---------|
| Simple add (PUSH+PUSH+ADD+HALT) | **0.213** | **~4,694,836** |
| Variable access (STORE+LOAD+ADD) | **0.243** | **~4,115,226** |
| Vector creation | **0.285** | **~3,508,772** |
| Unit conversion | **3.830** | **~261,097** |
| Dice roll | **0.506** | **~1,976,285** |
| Percentage | **0.566** | **~1,766,784** |

### Lexer Performance

| Input | Mean (ms) | Ops/sec |
|-------|-----------|---------|
| Simple arithmetic | **0.00111** | **~900,901** |
| Unicode math | **0.00109** | **~917,431** |
| Keywords | **0.00122** | **~819,672** |
| Mixed expression | **0.00149** | **~671,141** |
| Long expression (50 tokens) | **0.00968** | **~103,306** |
| Inline solve in text | **0.00151** | **~662,252** |
| Full markdown line | **0.000299** | **~3,344,482** |
| Empty string | **0.000260** | **~3,846,154** |
| Number only | **0.000837** | **~1,194,743** |
| Variable ref | **0.000963** | **~1,038,422** |
| Function call | **0.00108** | **~925,926** |
| Complex unit | **0.00140** | **~714,286** |
| Datetime | **0.00115** | **~869,565** |
| Dice roll | **0.00122** | **~819,672** |
| Vector | **0.00130** | **~769,231** |

### Parser + Compile Performance

| Input | Mean (ms) | Ops/sec |
|-------|-----------|---------|
| Simple arithmetic | **0.00314** | **~318,471** |
| Complex expression | **0.00292** | **~342,466** |
| Function call | **0.00291** | **~343,643** |
| Percentage | **0.00297** | **~336,700** |
| Unit conversion | **0.00294** | **~340,136** |
| Datetime | **0.00294** | **~340,136** |
| Dice | **0.00291** | **~343,643** |
| Vector | **0.00297** | **~336,700** |
| Variable | **0.00291** | **~343,643** |
| Mixed | **0.00287** | **~348,432** |
| **Mean parse+compile** | **~0.00158** | **~632,911** |

### Throughput (Lines/sec)

| Scale | Cold | Warm |
|-------|------|------|
| 100 lines | 200.7 | 561.2 |
| 1,000 lines | 274.5 | 396.8 |
| 10,000 lines | 117.6 | 125.9 |
| 50,000 lines | 33.1 | 34.1 |

### Pooling Improvements

| Pool | Mean ∆ | Notes |
|------|--------|-------|
| VM pool | **−151ns (−20.4%)** | Arena reuse avoids allocation |
| Builder pool | **−17.6ns (−0.7%)** | Minor; builders are lightweight |

### Diagnostic Overhead

| Scenario | Production | Diagnostic | Overhead |
|----------|------------|------------|----------|
| Single eval cold | 0.0346 ms | 0.0370 ms | +6.9% |
| Single eval warm | 0.0015 ms | 0.5355 ms | **+35,600%** ⚠️ |
| 50-line doc | 0.2256 ms | 0.2037 ms | −9.7% |

> ⚠️ Diagnostic warm eval is 357× slower — diagnostic mode must be off for benchmarks.

---

## 3. Regression Thresholds (CI)

If any benchmark exceeds these, the build fails. Period.

| Benchmark | Max Allowed | Current | Headroom |
|-----------|------------|---------|----------|
| `vm:simple_add` | 0.5 µs | 0.213 µs | 2.3× |
| `pipeline:single_eval_warm` | 0.01 ms (10µs) | 0.0014 ms | 7.1× |
| `pipeline:single_eval_cold` | 0.10 ms (100µs) | 0.0334 ms | 3.0× |
| `lexer:simple_arithmetic` | 0.005 ms (5µs) | 0.00111 ms | 4.5× |
| `lexer:long_expression` | 0.05 ms (50µs) | 0.00968 ms | 5.2× |
| `parser:simple_arithmetic` | 0.01 ms (10µs) | 0.00314 ms | 3.2× |
| `pipeline:200_line_doc` | 2.0 ms | 0.7766 ms | 2.6× |
| `pipeline:variable_chain` | 0.10 ms (100µs) | 0.0390 ms | 2.6× |
| `pipeline:20_inline_solves` | 0.50 ms | 0.1134 ms | 4.4× |
| `parse_compile:mean` | 0.005 ms (5µs) | 0.00158 ms | 3.2× |
| **Global multiplier** | **2.0× baseline** | — | Tight |

> **Note**: The global multiplier is 2.0× baseline — any regression beyond 2× the Phase 0 baseline fails CI.

---

## 3. How to Run Benchmarks

```bash
# Run benchmarks alongside tests
npm run test:ci

# Benchmark a specific area
npx jest benchmarks/lexerBenchmarks.spec.ts --no-coverage

# Compare two branches
npx jest benchmarks/ --no-coverage --compare
```

---

## 4. Measurement Methodology

### 4.1 Always warm up
Every benchmark runs `warmup` iterations (default: 100) before measuring. Cold JIT runs are excluded from timing.

### 4.2 Statistical rigour
Each benchmark runs `iterations` times (default: 10,000). We report:
- **mean** — arithmetic average
- **median (p50)** — typical experience
- **p95 / p99** — tail latency
- **min / max** — range
- **stddev** — variability

### 4.3 Results are persisted
`benchmarks/results/baseline.json` stores historical measurements. New runs compare against this baseline.

### 4.4 Never measure debug mode
Benchmarks always run with `diagnosticMode = false` unless specifically testing diagnostic overhead.

---

## 5. Targets — Where We Need to Go

| Metric | Current (Phase 0) | Target | Status |
|--------|---------|--------|--------|
| Single expression eval (warm) | 0.0014 ms (1.4µs) | **< 0.001 ms (1µs)** | 🟡 Near |
| Single expression eval (cold) | 0.0334 ms | **< 0.01 ms** | 🔴 |
| Lexer: simple expression | 0.00111 ms | **< 0.005 ms** | ✅ |
| Lexer: long expression (50 tokens) | 0.00968 ms | **< 0.05 ms** | ✅ |
| 200-line doc full pipeline | 0.777 ms | **< 0.5 ms** | 🟡 |
| Variable chain re-eval | 0.039 ms | **< 0.01 ms** | 🔴 |
| VM single add (pre-built bytecode) | 0.213 µs | **< 200ns** | 🔴 Near |
| Parse + compile mean | 1.58 µs | **< 1 µs** | 🟡 Near |
| `any` types in production | ~15 | 0 | 🔴 |
| Test coverage (core modules) | ~70% | > 90% | 🟡 |

### How We Get There
1. **Warm eval < 1µs**: Pool all TypedArrays, zero-copy bytecode → VM path, eliminate every remaining allocation
2. **Cold eval < 10µs**: Hybrid precedence-climbing parser, single shared VM instance, no re-allocation
3. **Variable chain < 10µs**: DAG-driven incremental eval — only re-eval truly dirty lines
4. **VM ops < 200ns**: Flat opcode dispatch (computed goto or lookup table), eliminate type checks in hot loop
5. **Parse + compile < 1µs**: Precedence climbing eliminates recursive descent overhead
6. **Zero `any` types**: Full TypeScript strictness — the compiler is our co-pilot

---

## 6. Golden Rules

1. **If you can't measure it, you can't improve it**
2. **No optimisation without a before/after benchmark**
3. **No merge if any threshold is breached**
4. **Micro-optimisations must be proven, not guessed**
5. **Correctness > speed. Always.**