# NANOSECOND-ETHOS GAP ANALYSIS — Complete Codebase Review

## Ethos: Nanosecond responses are the goal. Milliseconds are unacceptable.

Every allocation, every string comparison, every unnecessary object creation, and every redundant TypedArray instantiation between the user's expression and the returned result is a candidate for elimination. This document catalogs every remaining performance gap found across 42 test files, ~30 core modules, 9 providers, and the frontend integration.

---

## CATEGORY A: Hot-Path Micro-Optimizations (Sub-microsecond savings × millions of calls)

### GAP-A1: Value.toNumber() has no NaN guard (VM.ts:43-47)
- **Impact**: Silent NaN propagation corrupts every downstream calculation. `parseFloat("hello")` → NaN → NaN + 5 → NaN. Every `binaryOp()` call goes through this.
- **Current code**: `return parseFloat(this.value as string);`
- **Fix**: Return 0 with a warning for non-numeric strings, or throw a typed SolveError.
- **Nano-relevance**: Prevents silent corruption that would require expensive detection-and-recovery downstream.

### GAP-A2: NaN propagation in binaryOp (VM.ts:60-100)
- **Impact**: `binaryOp` calls `l.toNumber()` and `r.toNumber()` without checking if either is NaN. One corrupt input poisons the entire expression tree.
- **Fix**: Add NaN check after `toNumber()` calls in `binaryOp()`.
- **Nano-relevance**: A single NaN propagates through an entire computation silently.

### GAP-A3: TypedArrays created fresh on every execution (ExpressionEngine.ts:256-257)
- **Impact**: `new Uint8Array(program.opcodes)` and `new Float64Array(program.numbers)` allocate new TypedArrays for EVERY expression evaluation, even when bytecode hasn't changed. This is O(n) allocation + O(n) copy on every eval.
- **Current code**:
  ```typescript
  const vmUint8 = new Uint8Array(program.opcodes);
  const vmFloat64 = new Float64Array(program.numbers);
  ```
- **Fix**: Cache the TypedArray views on the BytecodeProgram object. Create them once after compilation and reuse.
- **Nano-relevance**: Eliminates thousands of unnecessary heap allocations per document parse. This is the **single largest performance win** available.

### GAP-A4: Bytecode stored as number[] not Uint8Array (BytecodeBuilder.ts:11-13)
- **Impact**: Opcodes are stored in a `number[]` then sliced/copied into `Uint8Array` at execution time. Double memory, double GC pressure.
- **Current code**: `private opcodes: number[] = [];` → `build()` returns `[...this.opcodes]`
- **Fix**: Use `Uint8Array` internally in BytecodeBuilder. Or at minimum, cache the TypedArray conversion.
- **Nano-relevance**: Halves memory usage for bytecode programs and eliminates array-to-TypedArray conversion.

### GAP-A5: reEvaluateLine creates a new VM (ExpressionEngine.ts:337)
- **Impact**: `createVM(sharedOpRegistry)` allocates a new `variables` Map, new `stack` array, and new VM object for every re-evaluation. This happens on every dirty-line re-evaluation.
- **Current code**: `const vm = createVM(sharedOpRegistry);`
- **Fix**: Reset and reuse the existing `this.vm` instance. Clear its stack/variables without reallocating.
- **Nano-relevance**: Avoids Map allocation + GC pressure on every line re-evaluation.

### GAP-A6: No stack pooling for VM stack arrays (VM.ts:7-8)
- **Impact**: Each VM gets a fresh `stack: Value[] = []`. For batch document processing, this means N allocations for N lines.
- **Fix**: Pre-allocate stack arrays and reset `stack.length = 0` instead of creating new ones.
- **Nano-relevance**: Reduces GC pressure dramatically during multi-line processing.

### GAP-A7: toNumber() called redundantly on same Value (VM.ts:30-58)
- **Impact**: In `unifyUom()`, `l.toNumber()` and `r.toNumber()` are called. Then in `binaryOp`, the result may call `toNumber()` again on the same Value. For complex expressions, `toNumber()` is called 3-5x on the same Value.
- **Fix**: Cache the `toNumber()` result on the Value object (lazy computation, stored on first call).
- **Nano-relevance**: Eliminates redundant type-checking and bigint-to-number conversion.

---

## CATEGORY B: Timeout & Safety Gaps (Preventing runaway execution)

### GAP-B1: No instruction limit in VM execute loop (VM.ts:102-418)
- **Impact**: A corrupted or malicious bytecode program runs forever. No `maxInstructions` enforcement from Configuration.
- **Current code**: `while (ip < opcodes.length)` — no counter, no timeout.
- **Fix**: Add instruction counter, break/throw when exceeding `vm.maxInstructions`.
- **Status**: Defined in CONFIG (PLAN_04) but **never enforced**. Safety-critical.

### GAP-B2: No stack depth limit in VM (VM.ts:7-8)
- **Impact**: Deeply nested expressions can overflow the JS call stack or exhaust memory.
- **Fix**: Check `stack.length >= maxStackDepth` on every push.
- **Status**: Defined in CONFIG (PLAN_04) but **never enforced**. Safety-critical.

### GAP-B3: No parse recursion depth limit (Parser.ts:19)
- **Impact**: `parseExpression()` recurses infinitely on deeply nested input.
- **Fix**: Track `this.depth`, throw when exceeding `maxNestingDepth`.
- **Status**: Defined in CONFIG (PLAN_04) but **never enforced**. Safety-critical.

### GAP-B4: No expression length check (ExpressionEngine.ts:220)
- **Impact**: A gigabyte string can be passed to the lexer/parser without rejection.
- **Fix**: Check `expression.length > maxExpressionLength` before lexing.
- **Status**: Defined in CONFIG (PLAN_04) but **never enforced**. Safety-critical.

### GAP-B5: UoM conversion silently swallows errors (VM.ts:153-159)
- **Impact**: Failed unit conversions return 0 without any indication. `convertUnit` throws are caught and set to 0.
- **Current code**: `try { durMs = convertUnit(...) } catch { durMs = 0; }`
- **Fix**: Log the error or return a diagnostic result. Don't silently zero.

---

## CATEGORY C: Memory & GC Pressure

### GAP-C1: ExpressionEngine exposes mutable DAG (ExpressionEngine.ts:358-359)
- **Impact**: `getDag()` returns the live DependencyGraph object. External code can mutate it, causing cache invalidation bugs.
- **Fix**: Return a read-only wrapper or clone.

### GAP-C2: ScopeManager stores full ExpressionRecord per variable (ScopeManager.ts:13)
- **Impact**: Every variable definition stores the complete bytecode + result. For large documents with many variables, this is significant memory.
- **Fix**: Store only what's needed (result Value + line number). Bytecode should be in the bytecode cache, not duplicated here.

### GAP-C3: LineCache key includes full expression string (LineCache.ts:31)
- **Impact**: Keys like `"42:100 + 200 * 3"` waste memory. Expressions can be long.
- **Fix**: Hash the expression and use `"lineNumber:hash"` as key.

### GAP-C4: UnifiedCache unused but loaded (UnifiedCache.ts, ExpressionCache inside it)
- **Impact**: 353 lines of dead code loaded at module import. `ExpressionCache` uses a naive custom hash that may collide.
- **Fix**: Remove or lazily-load unused cache classes.

---

## CATEGORY D: Algorithmic Inefficiencies

### GAP-D1: DependencyGraph.removeLine() iterates ALL consumers (DependencyGraph.ts:68-80)
- **Impact**: O(V) where V = number of unique variables. For large documents, this is called frequently.
- **Fix**: Track what each line reads (`lineReads` map) and only iterate those. O(k) where k = variables read by that line (typically 1-3).
- **Status**: Documented in PLAN_02.

### GAP-D2: DependencyGraph.registerLine() doesn't handle re-registration (DependencyGraph.ts:11-24)
- **Impact**: Stale consumer references accumulate. `getAffectedLines()` returns incorrect results after edits.
- **Fix**: Track old reads, remove old references before adding new ones.
- **Status**: Documented in PLAN_02.

### GAP-D3: Token type string comparisons (ExpressionEngine.ts:226-227)
- **Impact**: `t.type.startsWith("MD_")` does string prefix matching on every token. `t.type === TokenTypes.WS` does string equality.
- **Fix**: Use numeric enum values or a Set for O(1) lookup. (TokenTypes is already `as const`.)
- **Nano-relevance**: String comparison is slower than number comparison. In the hot tokenizer→parser→VM pipeline, this is called millions of times.

### GAP-D4: No batch tokenization (ExpressionEngine.ts:224-229)
- **Impact**: Each expression is tokenized individually in `evaluateExpressionWithDiagnostic()`. A 1000-line document = 1000 separate lexer.reset()/iterate cycles.
- **Fix**: Add `tokenizeAll(document)` that tokenizes the entire document in one pass, then distributes tokens to lines.
- **Status**: Documented in PLAN_05 as Phase 2.

### GAP-D5: DataQueryWorker handler leak (DataQueryWorker.ts:50-74)
- **Impact**: `onMessage` handlers accumulate without cleanup. Old handlers reference stale request IDs but are never removed.
- **Fix**: Store handler by request ID, replace/remove on response.

---

## CATEGORY E: Missing Infrastructure for Nanosecond Validation

### GAP-E1: Zero performance benchmarks (no baseline exists)
- **Impact**: Cannot measure whether optimizations help. Cannot detect regressions. Cannot validate the nanosecond ethos.
- **Fix**: Build the benchmark suite (PLAN_09) with statistical rigor.

### GAP-E2: No TypeScript path mapping for npm consumption
- **Impact**: Package is unusable by external consumers. No `types` or `exports` field. No `.d.ts` files.
- **Fix**: PLAN_08.

### GAP-E3: 15+ `any` types in production code
- **Impact**: TypeScript can't catch bugs. Runtime type checks are the only safety net.
- **Locations**: `tokens: any[]` in ExpressionEngine, `debug?: DebugInfo`, `program: any`, `(error: unknown)` patterns throughout.
- **Fix**: Replace with proper types, starting with hot-path types.

---

## CATEGORY F: "Advanced" Mode — Engine-Level Features to Unlock Frontend Optimization

These are enablers that the frontend (obsidian-solve) can leverage to achieve nanosecond-level perceived response times:

### GAP-F1: No pre-compilation / warm-up API (ExpressionEngine)
- **Problem**: First evaluation of any expression is slow (lex + parse + compile). The frontend can't pre-warm the cache.
- **Solution**: Add `engine.warmup(expressions: string[])` that pre-compiles a list of expressions into bytecode without executing. The Obsidian plugin can call this during vault load with common expressions.

### GAP-F2: No "evaluate to number" fast path (ExpressionEngine)
- **Problem**: Every evaluation returns a full `Value` object with type, value, unit. Most display contexts only need a number.
- **Solution**: Add `engine.evaluateNumber(expression): number` that skips Value allocation when the result is known to be numeric. Returns `number | NaN`.

### GAP-F3: No dirty-expression incremental evaluation (ExpressionEngine)
- **Problem**: When a variable changes, ALL dependent expressions are re-evaluated even if nothing changed.
- **Solution**: Use the DAG (after PLAN_02 fix) to identify truly affected lines. Only re-evaluate if an upstream value actually changed.

### GAP-F4: No parallel / worker-based evaluation (Workers)
- **Problem**: All expressions run on the main thread. Long documents block the UI.
- **Solution**: The DataQueryWorker infrastructure exists but isn't wired to ExpressionEngine. Workerized expression evaluation for independent sub-expressions would parallelize multi-line documents.

### GAP-F5: No expression compilation cache sharing across engines
- **Problem**: Each `ExpressionEngine` instance maintains its own parselet registry and bytecode cache. Multiple engines (e.g., plugin + API) duplicate work.
- **Solution**: Optionally accept shared registries/caches in the constructor. `static sharedRegistry` pattern.

### GAP-F6: Diagnostic mode has no zero-cost path (ExpressionEngine.ts:248-250)
- **Problem**: Even when `diagnosticMode = false`, tokens are iterated to check `this.diagnosticMode`. The `startsWith("MD_")` check and token filtering happen regardless.
- **Solution**: Move the token filter inline and use a direct boolean check (which the JIT will optimize). Or provide separate `parseLean()` and `parseDiagnostic()` methods.

---

## SUMMARY: Priority Execution Order for Nanosecond Ethos

| Priority | Gap | Plan | Est. Time | Impact |
|----------|-----|------|-----------|--------|
| **P0** | B1-B4 | PLAN_04 (Safety Limits) | 10-12h | Prevents catastrophic failures |
| **P0** | A3 | Cache TypedArrays on BytecodeProgram | 2h | Biggest single perf win |
| **P0** | A2 | NaN guard in binaryOp + toNumber | 1h | Stops silent data corruption |
| **P1** | A5 | Reuse VM in reEvaluateLine | 1h | Eliminates per-eval VM alloc |
| **P1** | D1-D2 | DAG fix (PLAN_02) | 3-4h | Correct incremental eval |
| **P1** | A4 | Use Uint8Array in BytecodeBuilder | 2h | Halves bytecode memory |
| **P2** | A1 | NaN propagation safety (PLAN_07) | 2-3h | Data integrity |
| **P2** | A7 | Cache toNumber() on Value | 1h | Eliminates redundant conversion |
| **P2** | F1 | Pre-compilation / warm-up API | 2h | Frontend fast path |
| **P2** | F2 | evaluateNumber() fast path | 2h | Frontend fast path |
| **P3** | D3 | Numeric token type comparison | 2h | Micro-optimization |
| **P3** | C1-C4 | Memory/GC fixes | 3h | Reduces GC pauses |
| **P3** | E1 | Benchmark suite (PLAN_09) | 12-15h | Validates all above |
| **P3** | F6 | Zero-cost diagnostic mode | 1h | Eliminates branch overhead |
| **P4** | F3 | Incremental/dirty evaluation | 4h | Only re-eval what changed |
| **P4** | F4 | Worker-based parallel eval | 8h | Multi-core utilization |
| **P4** | F5 | Shared registries across engines | 2h | Multi-engine dedup |
| **P5** | A6, C2-C4, D4, D5, E3 | Remaining cleanup | 10h | Polish |

**Estimated total: ~80-90 hours across all plans.**

---

## CRITICAL CONTEXT: The 4 Safety-Critical Bugs

These MUST be fixed before ANY performance optimization:

1. **B10/B11/B12** (PLAN_04): No validation limits enforced. A malicious expression can hang the engine forever.
2. **B5** (PLAN_03): The `SolveError` framework exists but is never used. All errors are untyped `throw new Error(...)`.

**Performance without safety is meaningless.** A nanosecond response that can be crashed or exploited is not production-ready.