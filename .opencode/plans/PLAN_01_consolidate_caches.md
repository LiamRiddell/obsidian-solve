# IMPLEMENTATION PLAN: Consolidate Cache Systems (B7)

## Bug: Three Overlapping Cache Systems
**File(s)**: `src/solve-js/src/cache/LineCache.ts`, `src/solve-js/src/cache/UnifiedCache.ts`, `src/solve-js/src/cache/LFUCache.ts`, `src/solve-js/src/vm/MemoCache.ts`

## Problem
The engine maintains three separate caching mechanisms with unclear ownership:
1. **LineCache** — per-engine, per-line cache with bytecode + results + dirty flags
2. **MemoCache** — per-engine, epoch-based, keyed by expr+line hash
3. **UnifiedCache** — generic LRU/LFU/TTL cache (not actually used by ExpressionEngine)

This creates confusion about which cache is authoritative and makes invalidation brittle.

## Implementation Steps

### Step 1: Audit current cache usage (1-2 hours)
- [ ] grep all usages of `LineCache`, `MemoCache`, `UnifiedCache` across the codebase
- [ ] Document every `set()`, `get()`, `markDirty()`, `clear()`, `invalidate()` call
- [ ] Identify which data each cache actually stores and who reads it
- [ ] Confirm that `UnifiedCache` and `ExpressionCache` (inside UnifiedCache.ts) are never actually used by the engine in production

### Step 2: Design unified cache architecture (1 hour)
- [ ] Decide on cache layering:
  - **Layer 1**: Bytecode cache (expression string → BytecodeProgram) — pure compilation result, no invalidation needed unless grammar changes
  - **Layer 2**: Result cache (line number + expression hash → Value) — invalidated on variable change via DAG
  - **Layer 3**: Line-level dirty tracking — used by Editor plugin to know which lines need re-rendering
- [ ] Define interfaces for each layer

### Step 3: Create ExpressionBytecodeCache (2-3 hours)
- [ ] New file: `src/solve-js/src/cache/ExpressionBytecodeCache.ts`
- [ ] Simple Map<string, BytecodeProgram> keyed by expression string hash
- [ ] Methods: `get(expression: string): BytecodeProgram | undefined`, `set(expression: string, program: BytecodeProgram): void`, `clear(): void`
- [ ] Write unit tests: set/get/clear, hash collision handling
- [ ] Integration test: parse same expression twice, verify second call uses cache

### Step 4: Merge LineCache and MemoCache into ResultCache (3-4 hours)
- [ ] New file: `src/solve-js/src/cache/ExpressionResultCache.ts`
- [ ] Internal: Map<string, CacheEntry> where key = `"line:hash"`
- [ ] CacheEntry: `{ result: Value, bytecodeRef: string, readVariables: string[], writeVariable: string | null, dirty: boolean }`
- [ ] Methods:
  - `getResult(line: number, expr: string): Value | undefined`
  - `setResult(line: number, expr: string, result: Value, bytecodeRef: string, reads: string[], writes: string | null): void`
  - `markDirty(line: number): void`
  - `markClean(line: number): void`
  - `invalidateVariable(variable: string, dag: DependencyGraph): void` — uses DAG to find affected lines and mark them dirty
  - `clear(): void`
- [ ] Write unit tests for all methods

### Step 5: Wire into ExpressionEngine (2-3 hours)
- [ ] Modify `ExpressionEngine` to replace `lineCache` and `memoCache` with new `ExpressionResultCache`
- [ ] Update `evaluateExpressionWithDiagnostic()` to use bytecode cache
- [ ] Update `reEvaluateLine()` to use result cache
- [ ] Update `markDirtyFromVariable()` to use result cache's `invalidateVariable()`
- [ ] Remove old `LineCache`, `MemoCache` imports
- [ ] Verify all existing tests still pass

### Step 6: Deprecate or remove unused cache classes (1 hour)
- [ ] Mark `UnifiedCache`, `ExpressionCache`, `LFUCache` as `@deprecated` OR remove if truly unused
- [ ] If keeping (for future DataQueryService use), move to `src/cache/legacy/`
- [ ] Update cache/index.ts exports

### Step 7: Run full test suite (30 min)
- [ ] `npm test` — all 42 test files
- [ ] Fix any regressions

## Acceptance Criteria
- [ ] LineCache and MemoCache are no longer used in ExpressionEngine
- [ ] All existing tests pass
- [ ] Cache hit/miss behavior is correct (test with dirty-line scenarios)
- [ ] Variable invalidation via DAG correctly marks affected lines dirty
- [ ] Bytecode is cached across re-evaluations of the same expression

## Risk Level: Medium
## Estimated Time: 12-16 hours

## Notes for Implementation
- Do NOT delete old cache files until the new system is proven working
- Keep the `UnifiedCache` class — it may be useful for the DataQueryService later
- The `ExpressionCache` and `DocumentCache` inside `UnifiedCache.ts` appear to be dead code — verify before removing