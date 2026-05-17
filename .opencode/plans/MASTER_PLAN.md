# 🏗️ MASTER PLAN: solve-js Engine — Stabilize, Test, Hyper-Optimize

## Philosophy
> **Nanosecond responses are the goal. Milliseconds are unacceptable.**
> But first: make it correct, make it testable, make it safe. Then make it fast.

## Guiding Principles
1. **Stabilize before optimizing** — no point making wrong answers fast
2. **Commit in small chunks** — each phase produces a working, testable, committable state
3. **Measure everything** — no optimization without benchmark proof
4. **Backwards compatible** — existing plugin/parselet API must never break
5. **Safety first** — execution limits enforced before any performance work

---

## PHASE 0: FOUNDATION — Benchmark Suite & Tooling
**Estimated: 12-15 hours | Priority: FIRST**

> *You can't improve what you can't measure. This runs in parallel with Phase 1.*

### 0.1 — Benchmark Infrastructure (PLAN_09)
**Output**: `benchmarks/` directory with statistical rigor

| Task | Detail |
|------|--------|
| StatRunner | Runs function N times, discards warmup. Calculates mean, median, p50, p95, p99, stddev |
| BenchmarkSuite | Groups related benchmarks, outputs summary table |
| Threshold system | `benchmarks/thresholds.ts` — defines max acceptable multipliers per benchmark |
| Historical storage | `benchmarks/results/benchmarks.json` — persists for regression comparison |
| `--compare` mode | Compare two branches/versions side-by-side |
| `--ci` flag | Fails build if any benchmark exceeds threshold |

### 0.2 — Benchmark Cases to Implement

| Category | Benchmarks | Target |
|----------|-----------|--------|
| **Lexer** | Simple arithmetic, unicode math, keywords, mixed expression, long expression, inline solve, full markdown line | tokens/ms |
| **Parser/Bytecode** | Same inputs as lexer, with/without bytecode cache | parse/ms |
| **VM Execution** | Simple add, complex expression, function call, vector creation, unit conversion, variable access, dice roll | exec/ms |
| **Full Pipeline** | Single eval (cold cache), single eval (warm cache), 100-line doc, 1000-line doc, variable chain, 50 inline solves, re-eval dirty propagation | eval/ms |
| **Regression** | Threshold: >2× current baseline = FAIL | pass/fail |

### 0.3 — Baseline Measurements
**Before any code changes**, run benchmarks and record:
- Cold parse+execute time per expression type
- Warm cache (bytecode) time per expression type
- 1000-line document processing time
- Memory usage (heap snapshot)
- All results committed as `benchmarks/results/baseline.json`

### 0.4 — Test Infrastructure (PLAN_10)
**Output**: Shared test utilities, reliable async patterns

| Task | Detail |
|------|--------|
| `testUtils.ts` | `createEngine()`, `evalExpr()`, `evalDoc()`, `tokenize()`, `waitForCondition()` |
| Remove duplicates | All 30+ test files reference shared helpers instead of local copies |
| Fix fragile async | Replace all `setTimeout` waits with `waitForCondition()` polling |
| Add `--verbose` timing | Every test reports duration |

**Critical**: The benchmark suite itself must be tested. A buggy benchmark is worse than no benchmark.

---

## PHASE 1: STABILIZE — Safety, Error Handling & DAG Fixes
**Estimated: 30-38 hours | Deliverable: Engine is safe, tested, and correct**

### 1.1 — Safety Limits Enforcement (PLAN_04) ⚠️ SAFETY-CRITICAL
**4 bugs fixed**: B10 (validation limits), B11 (no parse depth limit), B12 (no VM execution limit), B5 (error framework unused)

| Step | What | File |
|------|------|------|
| 1 | Wire `ValidationConfig` into `ExpressionEngine` constructor | `ExpressionEngine.ts` |
| 2 | Add expression length check at top of `evaluateExpressionWithDiagnostic()` | `ExpressionEngine.ts:220` |
| 3 | Add nesting depth tracking to `Parser.parseExpression()` | `Parser.ts:19` |
| 4 | Add instruction count limit to `executeBytecode()` while loop | `VM.ts:107` |
| 5 | Add stack depth limit — check on every `vm.push()` | `VM.ts:12-13` |
| 6 | Add complexity scoring (tokenCount + fnCount×5 + nestingDepth×10) | `ExpressionEngine.ts` |
| 7 | Set sane defaults in `Configuration.ts` | `Configuration.ts` |
| 8 | Write tests for all 4 safety limits | New test file |

**Default values:**
```
maxExpressionLength: 2000
maxComplexity: 500
maxNestingDepth: 50
vm.maxStackDepth: 200
vm.maxInstructions: 50000
```

### 1.2 — Standardize Error Handling (PLAN_03)
**Error framework goes from "exists but unused" to "every error is typed"**

| Step | What | File |
|------|------|------|
| 1 | Create `ErrorHelpers.ts` — `throwParsingError()`, `throwExecutionError()`, `throwValidationError()`, `wrapResult()`, `wrapError()` | New file |
| 2 | Replace all `throw new Error(...)` in Parser with `throwParsingError()` | `Parser.ts` |
| 3 | Add stack underflow checks in VM `pop()`/`peek()`, wrap in SolveError | `VM.ts` |
| 4 | Update `ExpressionEngine` methods to use SolveError categories | `ExpressionEngine.ts` |
| 5 | Wire `ErrorRecoveryManager` into data query pipeline | `DataQueryWorker.ts` |
| 6 | Update `DataQueryWorker`, `DataSourceStrategy`, `VariableResolver`, `CurrencyExchange` | Various |
| 7 | Write tests: parser throws SolveError, VM handles stack underflow, corrupted bytecode doesn't crash | New test file |

### 1.3 — Fix DependencyGraph (PLAN_02)
**Bugs B1 (re-registration) and B6 (removeLine inefficiency)**

| Step | What | File |
|------|------|------|
| 1 | Add `lineReads: Map<number, Set<string>>` to track what each line reads | `DependencyGraph.ts` |
| 2 | Update `registerLine()` to clean up old consumer refs on re-registration | `DependencyGraph.ts:11` |
| 3 | Update `removeLine()` to use `lineReads` instead of iterating all consumers | `DependencyGraph.ts:68` |
| 4 | Update `clear()` to include `lineReads.clear()` | `DependencyGraph.ts:94` |
| 5 | Write unit tests: re-registration, removeLine, getAffectedLines | New test file |
| 6 | Integration test: parse→edit→re-parse→verify correct dirty lines | New test file |

### 1.4 — Commit Gate
✅ All 42 existing tests pass  
✅ All new safety/error/DAG tests pass  
✅ No `throw new Error(...)` remaining in hot path  
✅ Safety limits enforced and tested  
✅ DAG correctly handles re-registration  

**Commit**: `fix: safety limits, error handling, DAG re-registration`

---

## PHASE 2: CACHE CONSOLIDATION & BYTECODE OPTIMIZATION
**Estimated: 20-25 hours | Deliverable: 5-10× speedup on repeated expressions**

### 2.1 — Cache TypedArrays on BytecodeProgram (GAP-A3) ⚡ BIGGEST WIN
**Eliminates 2 heap allocations per expression evaluation**

| Step | What | File |
|------|------|------|
| 1 | Add `cachedUint8: Uint8Array` and `cachedFloat64: Float64Array` fields to `BytecodeProgram` | `BytecodeBuilder.ts` |
| 2 | After `build()`, create and cache the TypedArray views once | `BytecodeBuilder.ts:52-59` |
| 3 | In `evaluateExpressionWithDiagnostic()`, use `program.cachedUint8` instead of `new Uint8Array(...)` | `ExpressionEngine.ts:256-257` |
| 4 | In `reEvaluateLine()`, use `program.cachedUint8` instead of `new Uint8Array(...)` | `ExpressionEngine.ts:334-335` |
| 5 | Benchmark: compare before/after | Phase 0 baseline vs now |

### 2.2 — BytecodeBuilder Internal Uint8Array (GAP-A4)
**Store opcodes as Uint8Array from the start**

| Step | What | File |
|------|------|------|
| 1 | Change `private opcodes: number[]` to `private opcodes: number[]` (keep for flexibility during build) | `BytecodeBuilder.ts` |
| 2 | OR: Keep number[] during build, but cache the Uint8Array conversion and reuse on rebuild | `BytecodeBuilder.ts` |
| 3 | Write test: bytecode immutability (consumer can't mutate internal arrays) | New test |

### 2.3 — Reuse VM in reEvaluateLine (GAP-A5)
**Avoid creating a new VM instance on every dirty-line re-eval**

| Step | What | File |
|------|------|------|
| 1 | Add `reset()` method to VM: clear stack + variables, keep registry reference | `VM.ts` |
| 2 | In `reEvaluateLine()`, call `this.vm.reset()` instead of `createVM(sharedOpRegistry)` | `ExpressionEngine.ts:337` |
| 3 | Write test: re-eval produces same results as fresh eval | New test |

### 2.4 — Cache toNumber() on Value (GAP-A7)
**Eliminate redundant type-checking in hot path**

| Step | What | File |
|------|------|------|
| 1 | Add `_cachedNumber: number | undefined` field to Value | `Value.ts:17-21` |
| 2 | First call to `toNumber()` computes, stores, and returns | `Value.ts:43-47` |
| 3 | All subsequent calls return cached value | `Value.ts:43-47` |
| 4 | Invalidation: clear cache on Value mutation (if ever added) | `Value.ts` |
| 5 | Benchmark: complex expressions with repeated toNumber() calls | Phase 0 baseline vs now |

### 2.5 — Commit Gate
✅ Benchmarks show measurable improvement over Phase 1 baseline  
✅ All existing + new tests pass  
✅ No regressions in correctness  

**Commit**: `perf: cache typed arrays, reuse VM, cache toNumber`

---

## PHASE 3: CONSOLIDATE CACHES (PLAN_01)
**Estimated: 12-16 hours | Deliverable: Single authoritative cache with clear ownership**

### 3.1 — Bytecode Cache Layer
**Cache: expression string → BytecodeProgram (long-lived, no invalidation)**

| Step | What | File |
|------|------|------|
| 1 | Create `ExpressionBytecodeCache.ts` — `Map<string, BytecodeProgram>` | New file |
| 2 | Methods: `get()`, `set()`, `clear()` | New file |
| 3 | Wire into `evaluateExpressionWithDiagnostic()` — check before parsing | `ExpressionEngine.ts` |
| 4 | Unit tests: cache hit/miss, clear, same expression returns same program | New test file |

### 3.2 — Merge LineCache + MemoCache into ResultCache
**Cache: lineNumber + expression hash → Value (short-lived, DAG-invalidated)**

| Step | What | File |
|------|------|------|
| 1 | Create `ExpressionResultCache.ts` — unified result + dirty tracking | New file |
| 2 | Key: `"line:hash"`, value: `{ result, bytecodeRef, readVariables, writeVariable, dirty }` | New file |
| 3 | Methods: `getResult()`, `setResult()`, `markDirty()`, `markClean()`, `invalidateVariable()` | New file |
| 4 | Wire into ExpressionEngine, replacing both LineCache and MemoCache | `ExpressionEngine.ts` |
| 5 | Deprecate (don't delete) UnifiedCache, ExpressionCache, LFUCache | `UnifiedCache.ts` |
| 6 | Integration test: variable change → correct lines marked dirty → correct results | New test file |

### 3.3 — Commit Gate
✅ Three caches → two (bytecode + result)  
✅ All existing tests pass  
✅ Dirty-line re-eval works correctly with new cache  

**Commit**: `refactor: consolidate cache systems`

---

## PHASE 4: FIX & VERIFY — NaN Safety + Edge Cases (PLAN_07 + PLAN_10)
**Estimated: 8-10 hours | Deliverable: Engine handles all edge cases gracefully**

### 4.1 — NaN Guard in toNumber() (GAP-A1)

| Step | What | File |
|------|------|------|
| 1 | Add NaN check to `toNumber()`: return 0 (or throw) for non-numeric strings | `Value.ts:43-47` |
| 2 | Add `isNaN()` helper method | `Value.ts` |

### 4.2 — NaN Safety in binaryOp (GAP-A2)

| Step | What | File |
|------|------|------|
| 1 | Check `isNaN(lNum) || isNaN(rNum)` before applying op | `VM.ts:60-100` |
| 2 | Return numberValue(0) or throw SolveError depending on error strategy | `VM.ts` |

### 4.3 — Edge Case Tests

| Test Case | Expected Behavior |
|-----------|------------------|
| `numberValue("hello").toNumber()` | Returns 0, not NaN |
| `"hello" + 1` | Doesn't propagate NaN |
| Division by zero | Returns Infinity or handles gracefully |
| Modulo by zero | Handles gracefully |
| Empty expression `""` | Returns 0 |
| Circular variable dependency `:x = :x + 1` | MUST NOT infinite loop (instruction limit catches this) |
| Extremely large numbers | Handled without crashing |
| Stack underflow | Throws SolveError, not crash |

### 4.4 — Commit Gate
✅ `toNumber()` never returns NaN  
✅ Arithmetic doesn't propagate NaN silently  
✅ All edge cases tested and handled  

**Commit**: `fix: NaN safety, division by zero, edge case handling`

---

## PHASE 5: PERFORMANCE VALIDATION & HYPER-OPTIMIZATION
**Estimated: 20-30 hours | Deliverable: Measured, proven performance improvements**

### 5.1 — Run Full Benchmark Suite
- Compare current state against Phase 0 baseline
- Identify top 5 slowest operations
- Set new baselines for Phase 5→6 comparison

### 5.2 — Micro-Optimizations (GAP-D3: Token-type comparisons)

| Step | What | File |
|------|------|------|
| 1 | Replace string comparisons with numeric enum lookups | `ExpressionEngine.ts:226-227` |
| 2 | Create `MARKDOWN_TOKEN_TYPES` Set for O(1) filtering | New constant |
| 3 | Benchmark: measure impact on 1000-line document | Phase benchmark baseline |

### 5.3 — Zero-Cost Diagnostic Mode (GAP-F6)

| Step | What | File |
|------|------|------|
| 1 | When `diagnosticMode = false`, skip parselet info collection entirely | `ExpressionEngine.ts:248-250` |
| 2 | Provide separate `parseLean()` vs `parseDiagnostic()` methods | `ExpressionEngine.ts` |
| 3 | Benchmark: compare diagnostic vs lean mode | Phase benchmark baseline |

### 5.4 — Pre-compilation / Warm-up API (GAP-F1)

| Step | What | File |
|------|------|------|
| 1 | Add `engine.warmup(expressions: string[])` — compiles but doesn't execute | `ExpressionEngine.ts` |
| 2 | Frontend can call this during vault load with common expressions | API documentation |
| 3 | Benchmark: first eval time before vs after warm-up | Phase benchmark baseline |

### 5.5 — evaluateNumber() Fast Path (GAP-F2)

| Step | What | File |
|------|------|------|
| 1 | Add `engine.evaluateNumber(expression): number | NaN` | `ExpressionEngine.ts` |
| 2 | Skips Value object allocation for known-numeric results | `ExpressionEngine.ts` |
| 3 | Benchmark: compare `evaluateLine` vs `evaluateNumber` overhead | Phase benchmark baseline |

### 5.6 — Commit Gate
✅ Every optimization has benchmark proof of improvement  
✅ No regressions in correctness  
✅ All tests pass  

**Commit**: `perf: micro-optimizations, lean mode, evaluateNumber fast path` (one commit per optimization)

---

## PHASE 6: ADVANCED — Parallelism & Incremental Evaluation
**Estimated: 24-32 hours | Deliverable: Multi-core utilization and minimal re-eval**

### 6.1 — Worker-Based Parallel Evaluation (GAP-F4)

| Step | What | File |
|------|------|------|
| 1 | Wire `DataQueryWorker` into ExpressionEngine for independent sub-expressions | `ExpressionEngine.ts`, `DataQueryWorker.ts` |
| 2 | Fix `onMessage` handler leak (GAP-D5) | `DataQueryWorker.ts` |
| 3 | Implement chunked parallel evaluation for multi-line documents | `ExpressionEngine.ts` |
| 4 | Benchmark: single-threaded vs worker parallel on 1000-line docs | Phase 5 baseline vs now |

### 6.2 — Incremental / Dirty Evaluation (GAP-F3)

| Step | What | File |
|------|------|------|
| 1 | When variable changes, use DAG to identify ONLY affected lines | `DependencyGraph.ts` (from Phase 1 fix) |
| 2 | Skip re-eval for lines whose upstream values didn't change | `ExpressionEngine.ts` |
| 3 | Benchmark: full re-eval vs incremental re-eval on single-variable change | Phase 5 baseline vs now |

### 6.3 — Shared Registries (GAP-F5)

| Step | What | File |
|------|------|------|
| 1 | Allow `ExpressionEngine` constructor to accept shared `ParseletRegistry` and `OpRegistry` | `ExpressionEngine.ts` |
| 2 | Add `static sharedRegistry` for simple single-engine use | `ParseletRegistry.ts` |
| 3 | Document: singleton `Solve` vs multi-engine patterns | API documentation |

### 6.4 — Commit Gate
✅ Worker evaluation works and is benchmarked  
✅ Incremental eval produces correct results with fewer evaluations  
✅ Shared registries work across engine instances  

**Commit**: `feat: worker parallelism, incremental eval, shared registries`

---

## PHASE 7: PRODUCTION READINESS
**Estimated: 15-20 hours | Deliverable: npm-ready, documented, enterprise-grade**

### 7.1 — Plugin System Integration (PLAN_06)

| Step | What | File |
|------|------|------|
| 1 | Add `plugins?: SolvePlugin[]` to ExpressionEngine constructor | `ExpressionEngine.ts` |
| 2 | Add `registerPlugin()`/`unregisterPlugin()` runtime methods | `ExpressionEngine.ts` |
| 3 | Wire PluginSystem to ExpressionEngine (currently disconnected) | `PluginSystem.ts`, `ExpressionEngine.ts` |
| 4 | Extend `ISolvePackage` with `dataSources`, `config` fields | `SolveAPI.ts` |
| 5 | Tests: register/unregister plugin, plugin with data source, cache invalidation on register | New test file |

### 7.2 — npm Package Configuration (PLAN_08)

| Step | What | File |
|------|------|------|
| 1 | Add `types`, `exports`, `main`, `module` fields to package.json | `package.json` |
| 2 | Configure dual CJS/ESM build output | Build config |
| 3 | Generate `.d.ts` declaration files | Build config |
| 4 | Export ALL public API from `index.ts` | `index.ts` |
| 5 | Test consumer project verifies imports work | Test project |

### 7.3 — Resolve `any` Types (GAP-E3)

| Step | What | File |
|------|------|------|
| 1 | Audit all `any` types in production code | Various |
| 2 | Replace with proper types (start with hot-path: tokens[], program, debug) | Various |
| 3 | Run full test suite to catch type-related breakage | All tests |

### 7.4 — Secrets & Keys Hygiene

| Step | What | File |
|------|------|------|
| 1 | Audit codebase for any hardcoded API keys or secrets | `src/**/*.ts` |
| 2 | Remove or replace with config-based injection | Various |

### 7.5 — Commit Gate
✅ Plugin system wired and tested  
✅ Package npm-ready with types and dual CJS/ESM  
✅ No remaining `any` in hot-path code  
✅ No exposed secrets  

**Commit**: `chore: npm readiness, plugin integration, type safety`

---

## PHASE 8: FINAL VALIDATION & RELEASE
**Estimated: 5-8 hours**

### 8.1 — Full Regression Run
- [ ] Run complete benchmark suite — compare against all phase baselines
- [ ] Run all 42+ tests — zero failures
- [ ] Run tests 5× to verify no flakiness
- [ ] Generate coverage report — target >85% on core modules

### 8.2 — Final Commits
| Commit | Contents |
|--------|----------|
| Phase 1 | Safety limits, error handling, DAG fix |
| Phase 2 | TypedArray caching, VM reuse, toNumber cache |
| Phase 3 | Cache consolidation (bytecode + result) |
| Phase 4 | NaN safety, edge cases |
| Phase 5 | Micro-optimizations, lean mode, evaluateNumber |
| Phase 6 | Worker parallelism, incremental eval, shared registries |
| Phase 7 | Plugin system, npm config, type cleanup |

### 8.3 — Release
- [ ] Version bump following semver
- [ ] Generate changelog from commit messages
- [ ] Publish to npm
- [ ] Tag release

---

## WORKING BRANCHES

| Branch | Scope |
|--------|-------|
| `feat/safety-limits` | Phase 1 |
| `perf/bytecode-caching` | Phase 2 |
| `refactor/unified-cache` | Phase 3 |
| `fix/nan-safety` | Phase 4 |
| `perf/micro-optimizations` | Phase 5 |
| `feat/worker-parallelism` | Phase 6 |
| `chore/npm-readiness` | Phase 7 |
| `release/v0.1.0` | Phase 8 |

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| Optimization introduces subtle bug | Every phase has full test suite + benchmark regression detection |
| Performance regression undetected | `--ci` flag fails build on threshold breach |
| Breaking change to plugin API | All phases maintain backward compatibility; plugin integration tested in Phase 7 |
| Scope creep | Each phase has clear commit gate; no phase starts without previous passing all tests |
| Memory regression from caching | Monitor heap in benchmark suite; cache has bounded size |

---

## ESTIMATED TOTAL: ~115-150 hours across all phases

**The engine will be correct and safe after Phase 1. Fast after Phase 2. Production-ready after Phase 7. Verified at every step.**

---

*Ready when you are. Say the word: **kick off**.*