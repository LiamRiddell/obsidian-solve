# PERFORMANCE BUDGETS — solve-js

> How fast every component must be. These are not aspirations — they are gates.

## 1. Top-Level Target

**Full pipeline (lex → parse → compile → execute) completes in < 1ms for a single expression.**
**Individual VM operations target nanosecond-level execution.**

---

## 2. Current Performance Baseline (Phase 0 → Phase 8)

### Pipeline Benchmarks (Full Stack)

| Scenario | Mean (ms) | Ops/sec | Notes |
|----------|-----------|---------|-------|
| Single eval (cold) | ~0.60 | ~1,667 | New engine, no cache |
| Single eval (warm) | **0.0022** | **~454,000** | Cached bytecode + shared VM |
| 50-line doc | ~0.76 | ~1,316 | Mixed expressions |
| 200-line doc | **1.21** | ~826 | Full doc parse + eval |
| Variable chain (5 lines) | ~0.58 | ~1,724 | DAG-tracked deps |
| 20 inline solves | ~0.63 | ~3,175 | Inline `s\`...\`` extraction |
| Re-eval dirty line | ~0.57 | ~1,754 | Cached bytecode + VM reset |
| Mixed complex ($ + % + units) | ~0.62 | ~1,613 | Cross-provider |

### VM Isolated (Pre-Built Bytecode)

| Operation | Mean (µs) | Ops/sec |
|-----------|-----------|---------|
| Simple add (PUSH+PUSH+ADD+HALT) | ~0.5 | ~2,000,000 |
| Variable access (STORE+LOAD+ADD) | ~0.8 | ~1,250,000 |
| Vector creation | ~0.6 | ~1,666,667 |
| Unit conversion | ~4.0 | ~250,000 |
| Dice roll | ~0.7 | ~1,428,571 |
| Percentage | ~0.8 | ~1,250,000 |

### Lexer Performance

| Input | Mean (ms) | Ops/sec |
|-------|-----------|---------|
| Simple arithmetic | 0.0028 | ~357,000 |
| Unicode math | 0.0036 | ~278,000 |
| Long expression (50 tokens) | 0.0752 | ~13,300 |
| Empty string | 0.0004 | ~2,631,000 |

---

## 3. Regression Thresholds (CI)

If any benchmark exceeds these, the build fails. Period.

| Benchmark | Max Allowed | Notes |
|-----------|------------|-------|
| `vm:simple_add` | 0.05 ms (50µs) | Single opcode execution |
| `pipeline:single_eval_warm` | 0.05 ms (50µs) | Cached bytecode — should be sub-µs |
| `pipeline:single_eval_cold` | 0.50 ms | Includes parse + compile |
| `lexer:simple_arithmetic` | 0.01 ms (10µs) | Tokenisation only |
| `lexer:long_expression` | 0.10 ms (100µs) | 50-token expressions |
| `parser:simple_arithmetic` | 0.05 ms (50µs) | Parse + bytecode compile |
| `pipeline:100_line_doc` | 5 ms | Bulk document |
| `pipeline:variable_chain` | 0.10 ms (100µs) | DAG-driven re-eval |
| **Global multiplier** | **2.0× baseline** | Tighter than before |

> **Note**: The global multiplier used to be 3.0×. We're tightening to 2.0× because our baselines are now fast enough that 3× is too generous.

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

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Single expression eval (warm) | 0.0022 ms (2.2µs) | **< 0.0005 ms (500ns)** | 🔴 |
| Single expression eval (cold) | 0.60 ms | **< 0.5 ms** | 🟡 |
| Lexer: simple expression | 0.0028 ms | **< 0.01 ms** | ✅ |
| Lexer: long expression (50 tokens) | 0.075 ms | **< 0.1 ms** | ✅ |
| 200-line doc full pipeline | 1.21 ms | **< 1 ms** | 🟡 |
| Variable chain re-eval | 0.58 ms | **< 0.1 ms** | 🔴 |
| VM single add (pre-built bytecode) | 0.5 µs | **< 200ns** | 🔴 |
| `any` types in production | ~15 | 0 | 🔴 |
| Test coverage (core modules) | ~70% | > 90% | 🟡 |

### How We Get There
1. **Warm eval < 500ns**: Pool all TypedArrays, zero-copy bytecode → VM path, eliminate every remaining allocation
2. **Cold eval < 500µs**: Pre-compiled bytecode at parse time, single shared VM instance, no re-allocation
3. **Variable chain < 100µs**: DAG-driven incremental eval — only re-eval truly dirty lines
4. **VM ops < 200ns**: Flat opcode dispatch (computed goto or lookup table), eliminate type checks in hot loop
5. **Zero `any` types**: Full TypeScript strictness — the compiler is our co-pilot

---

## 6. Golden Rules

1. **If you can't measure it, you can't improve it**
2. **No optimisation without a before/after benchmark**
3. **No merge if any threshold is breached**
4. **Micro-optimisations must be proven, not guessed**
5. **Correctness > speed. Always.**