# IMPLEMENTATION PLAN: Performance Optimization — Bytecode Caching & Lexer Reuse

## GAP 3.1.2 / GAP 3.1.1: Repeated Lexer Initialization & No Bytecode Caching
**File(s)**: `src/solve-js/src/engine/ExpressionEngine.ts`, `src/solve-js/src/lexer/MarkdownLexer.ts`, `src/solve-js/src/lexer/Lexer.ts`

## Problem
1. Every `new ExpressionEngine()` call compiles ~140+ moo regex patterns
2. `parseDocument()` re-tokenizes and re-compiles bytecode for every expression, even identical ones
3. Lexer `reset()` calls moo's `reset()` which may reinitialize internal state

## Implementation Steps

### Step 1: Add expression → bytecode cache (2-3 hours)
- [ ] New module: `src/solve-js/src/cache/ExpressionBytecodeCache.ts`
- [ ] Simple `Map<string, BytecodeProgram>` keyed by expression string
- [ ] Alternatively use a WeakMap if memory is a concern
- [ ] Methods:
  - `get(expression: string): BytecodeProgram | null`
  - `set(expression: string, program: BytecodeProgram): void`
  - `clear(): void`
  - `invalidateAll(): void` (for grammar changes)

### Step 2: Integrate bytecode cache into ExpressionEngine (2 hours)
- [ ] Add `private bytecodeCache = new ExpressionBytecodeCache()` in constructor
- [ ] Modify `evaluateExpressionWithDiagnostic()`:
  ```typescript
 // After tokenization, before parsing:
  const cachedProgram = this.bytecodeCache.get(expression);
  let program;
  if (cachedProgram) {
    program = cachedProgram;
    // skip parsing, rebuild typed arrays only
    const vmUint8 = new Uint8Array(program.opcodes);
    const vmFloat64 = new Float64Array(program.numbers);
  } else {
    // parse and build as before
    // after building, cache the result
    this.bytecodeCache.set(expression, program);
  }
  ```
- [ ] Add cache invalidation in constructor or when providers change
- [ ] Consider sharing cache across ExpressionEngine instances (static)

### Step 3: Lexer instance reuse (1 hour)
- [ ] Instead of `this.lexer.reset(expression)` for each expression, keep a single instance
- [ ] The current code already does reuse within `ExpressionEngine` — verify the moo lexer's `reset()` is truly efficient
- [ ] If moo's reset recompiles, create a prototype-based clone approach

### Step 4: Pre-compile token type checks (1 hour)
- [ ] In `evaluateExpressionWithDiagnostic()`, the token filter:
  ```typescript
  if (t.type === TokenTypes.WS) continue;
  if (t.type.startsWith("MD_")) continue;
  ```
- [ ] This string comparison is fine, but the `startsWith` check could be replaced with a Set lookup
- [ ] Create a `Set<string>` of markdown token types at module load time

### Step 5: Batch tokenization for document parsing (1-2 hours)
- [ ] Instead of tokenizing per-expression in `evaluateExpressionWithDiagnostic()`:
- [ ] Add a `tokenizeAll(document: string)` method to Lexer that returns `Token[][]` (one array per line)
- [ ] This processes the entire document in a single pass through moo
- [ ] For lines without inline solves, use the tokens directly
- [ ] For lines with inline solves, extract the inner tokens
- [ ] Benefit: markdown state tracking (headings, blockquotes, etc.) flows naturally across lines

### Step 6: Optimize `parseDocuments` line processing (1 hour)
- [ ] Current code splits on `
` then processes each line independently
- [ ] Add early-exit checks: if a line is clearly a comment (`#` or `//`), skip entirely without lexing
- [ ] Add simple heuristic: if a line has no backtick and no colon prefix, treat as plain text (skip parsing)

### Step 7: Write benchmarks (1 hour)
- [ ] Use the new benchmark suite framework (See `benchmarks/` documentation)
- [ ] Benchmark scenarios:
  - Single expression repeated 100 times (with cache)
  - 1000-line document with unique expressions
  - 1000-line document with many duplicate expressions
  - Cold cache (no cached bytecode) vs warm cache
  - Lexer-only timing vs full pipeline timing

### Step 8: Run full test suite (30 min)
- [ ] All tests must still pass
- [ ] Verify cache hit/miss scenarios work correctly

## Acceptance Criteria
- [ ] Identical expressions reuse cached bytecode (zero re-parsing)
- [ ] 1000-line document processing time is measurably reduced
- [ ] Memory usage is acceptable (cache has bounded size or LRU eviction)
- [ ] All existing tests pass
- [ ] Benchmark suite is in place

## Risk Level: Low-Medium
## Estimated Time: 10-12 hours

## Notes
- The bytecode cache is the single highest-impact optimization
- Document-level batch tokenization is a larger refactor — consider it Phase 2
- Cache size management: for unbounded documents, add a max cache size with LRU eviction (reuse `UnifiedCache` pattern)