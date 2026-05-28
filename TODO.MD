# Solve-JS Pipeline Improvements — Prioritized TODO

> Generated: May 28, 2026 — Based on end-to-end profiling heatmap analysis.
> Full report: `PIPELINE_HEATMAP_REPORT.html`

## Pipeline Stage Distribution (Total: 9,350ns per expression)

| Stage | Time (ns) | % | Status |
|---|---|---|---|
| 🔤 Lexer | 2,141 | 22.9% | **Primary target** |
| 🧠 Parser | ~3,700 | 39.6% | V8-saturated |
| 📦 BytecodeBuilder | ~2,153 | 23.0% | Allocation-heavy |
| ⚡ VM Execute | 1,356 | 14.5% | Already fast |
| **Total** | **9,350ns** | **100%** | |

---

## P0 — High Priority (Biggest Wins)

### 1. Combine Expression + Markdown Lexers
- **Cost**: 2,141ns (22.9% of pipeline)
- **Goal**: ~1,500ns (30% reduction)
- **Approach**: Single dual-mode scanner that avoids mode-switch overhead. ExpressionLexer for expression lines, MarkdownLexer for markdown. Combined into one class with inline mode detection.
- **Verification**: Lexer benchmarks should show ~30% improvement on `mixed_expression` and `long_expression` categories.
- **Tests**: Existing lexer benchmarks cover all categories. Add throughput comparison.

### 2. BytecodeBuilder Pool
- **Cost**: ~2,153ns (23% of pipeline — 4 object allocations per expression)
- **Goal**: ~1,700ns (20% reduction)
- **Approach**: Pre-allocate a pool of BytecodeBuilder instances (like the `bufferPool` already used for TypedArrays). Reuse across expressions instead of `new BytecodeBuilder()` for every parse.
- **Verification**: Pipeline benchmarks should show improvement on cold eval. Warm eval (cached) won't change.
- **Tests**: Add pool exhaustion + correctness tests.

---

## P1 — Medium Priority (Moderate Wins)

### 3. Unit Conversion Memoization
- **Cost**: 5,930ns per conversion (84% of VM time for UOM ops)
- **Goal**: ~930ns (84% reduction on UOM paths)
- **Approach**: LRU cache for `convertUnit(fromVal, fromUnit, toUnit)` results. Most conversions repeat (e.g., `cm→m`, `USD→GBP`).
- **Tests**: Add cache hit/miss tests.

### 4. Batch-Parse Independent Expressions
- **Cost**: N × (Builder + Parser + VM setup) per expression line
- **Goal**: ~20% reduction for multi-expression documents
- **Approach**: When `parseDocument()` processes multiple independent expressions, batch-tokenize and parse them in a single Parser.load() call with a combined token list and sentinel tokens between expressions.
- **Tests**: Document-level throughput benchmarks.

### 5. Dedicated Fast-Path for Built-in Arithmetic
- **Cost**: Registry lookup per token in hot infix loop
- **Goal**: ~100ns per expression
- **Approach**: Move the most common parselets (+, -, *, /, ^) out of the ParseletRegistry hash lookup into a dedicated fast-path. Use the package system to register built-in arithmetic as a "core" package with direct dispatch.
- **Verification**: Parser benchmarks for `simple_arithmetic` category.

### 6. Parser Hot Loop — Further Investigation
- **Status**: V8-saturated after 13 failed experiments. Only structural changes work.
- **Remaining ideas**:
  - Pre-register infix parselets into a dense array indexed by token type enum (no hash lookup)
  - Combine Parser + BytecodeBuilder into a single class (eliminates cross-object property access)
  - Use `SharedArrayBuffer` for the pool to enable worker-thread parsing

---

## P2 — Lower Priority (Safety & Features)

### 7. Plugin System: Prevent Keyword/Operator Overrides
- **Cost**: Safety — prevents plugin conflicts
- **Approach**: Guard checks in `registerPlugin()` — built-in keywords/operators/units/phrases cannot be overridden.
- **Tests**: Write fuzz tests for plugin registration conflicts.
- **Status**: Already partially implemented — add comprehensive tests.

### 8. Packages: Use Package System for Shipped Arithmetic
- **Approach**: Refactor built-in arithmetic, percentage, function providers to use the ISolvePackage interface consistently. This enables selective provider loading and reduces cold-start cost.
- **Tests**: Verify all existing tests pass when loading via package system.

### 9. Parser Optimizations (Research)
- **Approach**: Investigate whether the Pratt parser can be replaced with a precedence-climbing parser (fewer function calls, simpler dispatch).
- **Verification**: Benchmark comparison between current Pratt and alternative approach.

---

## P3 — Maintenance

### 10. Jest Memory Leak Fixes
- **Symptom**: Worker process force-exits during FullPipeline tests.
- **Approach**: Follow StackOverflow advice on Jest memory leaks (`--expose-gc`, proper cleanup in `afterAll`, `--workerIdleMemoryLimit`).
- **References**: https://stackoverflow.com/questions/62885390/my-jests-tests-are-leaking-memory-how-can-i-fix-this

### 11. Convert Keyword: Support Parenthesized Expressions
- **Symptom**: `convert (100 cm + 1 m) to mm` returns NaN. `convert 100 cm to m` works fine.
- **Approach**: The `ConvertParselet` expects a simple value token, not a parenthesized expression. Extend to handle arbitrary expressions.

---

## BODMAS Test Results

- **58/58 tests pass** (including all critical mixed expressions)
- `100 + (25 USD * 2 / 2) in GBP` → ~92.4 GBP ✓
- Exponent is **left-associative** (matches calculator behavior)
- Mixed currency (`$100 + 100 EUR + £100`) auto-converts correctly
- Percentage × UOM × Currency all chain correctly

---

## Quick Wins (Low Effort, Immediate Impact)

1. ~~`getBindingPower()` → `bindingPower` property~~ ✅ Done
2. ~~Remove dead `parenDelta` field~~ ✅ Done
3. **Unit conversion LRU cache** ← Next easiest, highest impact (P1 #3)
4. **BytecodeBuilder pool** ← Easy, good perf (P0 #2)
