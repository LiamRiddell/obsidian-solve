# MASTER PLAN — obsidian-solve Deep Review

> Generated: 2026-05-21 | Reviewer: AI Deep Audit
> Target: Full production readiness with nanosecond-level performance

---

## Executive Summary

The project is in **impressive shape** — 48+ test suites, 1,164+ tests passing, 254× warm-cache throughput improvement from baseline. However, a deep audit reveals **6 categories of work** needed before this is production-ready and npm-shippable as a standalone package.

### Quick Stats

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Warm eval throughput | ~454,000 ops/sec | >2,000,000 ops/sec | 🔴 |
| `any` types in production | ~37 instances across 15+ files | 0 | 🟢 |
| `throw new Error()` violations | 29+ locations | 0 (all ErrorFactory) | ✅ |
| Duplicate interface definitions | ParsingResult.ts had 3× dupes | 0 | ✅ |
| Worker entry point duplication | 3 near-identical files | 1 canonical file | 🔴 |
| Dead/vestigial code files | MemoCache deleted, benchmark .js removed, others remain | Removed | 🟡 |
| Provider grammar coverage | Incomplete per TODO.md | Full | 🟡 |
| Class exceeds 300-line limit | ExpressionEngine (615 lines) | Split into multiple files | 🟡 |
| Pipeline benchmark (200-line doc) | 1.21 ms | < 1 ms | 🟡 |

---

## Category 1: Performance Optimization

### 1.1 VM Hot Loop Optimization

**Current State:** The VM's `executeBytecode()` uses a large `switch` statement with ~40 cases. Each iteration pushes/pops through lambdas that do bounds checks. `Value.toNumber()` is called 3-5× per value in complex expressions.

**Problems:**
- `switch` dispatch is JIT-friendly but still a branch table lookup
- `toNumber()` called repeatedly on the same Value in `binaryOp()`, `unifyUom()`, etc.
- `binaryOp()` does type checks for Vector, UoM, BigInt on every arithmetic op even when both operands are plain numbers
- The diagnostic trace check (`if (traceEnabled)`) is inside the hot loop even though it's trivially false in production

**Plan:**
1. **Cache `toNumber()` result on `Value`** — Add a `private _cachedNumber?: number` field. `toNumber()` computes once then caches. Value is immutable so this is safe. Estimated: ~20-30% speedup on complex expressions.
2. **Fast-path numeric-only operations** — Before the full type dispatch, check `if (l.type === ValueType.Number && r.type === ValueType.Number)` and inline the arithmetic directly, skipping all helper functions.
3. **Move trace check out of hot path** — Use two `executeBytecode` variants or check once before entering the loop.
4. **Fix `buildInto()` zero-copy** — Currently uses `slice()` which copies. Instead, maintain a free-list of pre-allocated TypedArrays and truly reuse them by tracking used length.
5. **Expand buffer pool** — 256 opcodes / 64 numbers is too small for complex expressions. Profile to find the 95th percentile expression complexity and size the pool accordingly. Fall back to allocation only for outliers.
6. **Consider computed dispatch** — Replace `switch` with a `const dispatch = [fn0, fn1, ...]` lookup table indexed by opcode. Some JS engines optimize this better than switch.

### 1.2 Document Engine Architecture (Enterprise-Grade Redesign)

> **Key Insight:** Move the optimization into the engine library, not the frontend. The engine should receive the **full document + viewport range** and handle everything internally — caching, incremental updates, and zero-allocation scrolling.

**Current State (post-batch-eval):** `MarkdownEditorViewPlugin.buildDecorations()` collects visible line texts, sends them as `string[]` to `engine.evaluateLines()`. Better than per-line calls but still treats each render as a fresh batch with no persistent document model.

**Core Architectural Shift:** The engine should maintain a persistent `DocumentModel` that represents the user's document. The frontend sends two types of updates:
1. **Document changes** (edits) → incremental model updates
2. **Viewport changes** (scrolls) → zero-allocation execution of cached bytecode

This moves all optimization intelligence into `solve-js` where it belongs as a library.

#### 1.2.1 DocumentModel — Persistent Document Representation

**Data Structure:** Segment Tree (or B-Tree) of lines, not a flat array.
- **Why not array:** CodeMirror insert/delete operations cause O(N) line number shifts in flat arrays, breaking caches. A tree supports O(log N) structural splices.
- **Internal nodes:** Track aggregate line counts and variable definition summaries for fast scope lookup.
- **Leaf nodes (`LineState`):**
  ```typescript
  interface LineState {
    textHash: number;          // FastHash for change detection
    expression: string | null; // Extracted expression (null = markdown-only line)
    bytecode: Uint8Array;      // Compiled bytecode (postMessage-transferable)
    numbers: Float64Array;     // Number constants pool
    strings: string[];         // String constants pool
    reads: string[];           // Variables this line reads
    writes: string[];          // Variables this line writes
    result: Value | null;      // Last evaluation result
    dirty: boolean;            // Needs re-evaluation
    isVariableDef: boolean;    // Does this line define a variable? (never evict)
  }
  ```

#### 1.2.2 Viewport Model — Contiguous Range, Not Bitset

**Use a viewport range `[startLine, endLine]` with overscan buffer (±20 lines).**
- Users scroll contiguously — a range is O(1) to transmit and check.
- No need for sparse bitsets. Standard editor UX never has holes in the viewport.
- Overscan pre-compiles lines just outside the viewport so they're cache-hot when scrolled into view.

#### 1.2.3 Three-Tier Evaluation Strategy

| Tier | Condition | Action | Thread |
|------|-----------|--------|--------|
| **Tier 1** | Visible + Dirty (new/changed) | Full pipeline: Lex → Parse → Compile → Execute | Worker |
| **Tier 2** | Visible + Cached (scroll into view) | **Execute-only** from cached bytecode against VM checkpoint | Main |
| **Tier 3** | Invisible (outside viewport) | **Dependency-track only**: Lex → Parse → Compile to discover reads/writes. Execute only variable assignments (to build VM state). Skip display-only execution. | Worker (background) |

**Tier 3 optimization:** For invisible lines that are pure expressions (no variable writes), we can skip compilation entirely and only do a lightweight parse to extract variable reads. This saves 60-80% of CPU for large documents.

#### 1.2.4 Incremental Document Updates

Map CodeMirror's `ChangeSpec` directly to Segment Tree splices:
- **Change: "replaced lines 10-15 with 3 new lines"**
  - Tree splices out old leaf nodes, inserts new ones
  - No line number shifting — tree maintains relative positions
  - Mark changed lines + all DAG downstream lines as `Dirty`
  - Trigger topological re-evaluation: only re-execute, don't re-parse
- **Change: single character edit on line 42**
  - Hash the line text, compare with stored `textHash`
  - If expression changed → re-parse, re-compile, re-execute (Tier 1)
  - If only whitespace/comment changed → mark as Dirty but preserve bytecode

#### 1.2.5 Zero-Allocation Scrolling (The Holy Grail)

When `setViewport(newRange)` is called and user just scrolled:
1. Engine iterates over newly visible lines
2. Bytecode is read from pre-allocated `Uint8Array` pools (no allocation)
3. VM executes against the nearest prior **VM State Checkpoint** (see 1.2.6)
4. Results are posted back to the frontend for rendering
5. **Net result:** O(visible instructions) time, zero allocations, instant 60fps scroll

**To achieve true zero-allocation:**
- `Value` objects must be reused from a pool during scroll execution
- `binaryOp()` must write into pre-allocated number slots, not create new `Value` objects
- `executeBytecode()` must use a recyclable output buffer for results

#### 1.2.6 VM State Checkpoints (Structural Sharing)

**Problem:** Variables ripple down the document. Re-running from line 1 on every scroll is too slow.

**Solution:** Checkpoint the VM scope after every line that contains a variable assignment.
- Use prototypal inheritance: `checkpointScope = Object.create(previousCheckpointScope)`
- Only changed variables create new entries; unchanged variables are inherited from parent
- To evaluate line 100, the VM points its scope pointer to the line 99 checkpoint and executes
- **Memory:** O(variables × versions) — typically < 1KB per checkpoint for average documents
- **Time:** O(1) to snapshot, O(1) to restore

```typescript
interface VMCheckpoint {
  lineNumber: number;
  scope: Record<string, Value>;     // prototypal chain to parent
  parent: VMCheckpoint | null;
}
```

#### 1.2.7 New Engine API

```typescript
interface DocumentEngine {
  // Initialize with full document text
  setDocument(text: string): void;

  // Apply CodeMirror changes incrementally. Returns decorations for visible lines only.
  applyTransaction(changes: ChangeSpec, viewport: ViewportRange): RenderUpdate[];

  // Scroll-only: no parsing, no compiling, just execute cached bytecode.
  // Must complete in < 1ms for all visible lines. Returns decorations.
  setViewport(range: ViewportRange): RenderUpdate[];

  // Get the current viewport range
  getViewport(): ViewportRange;

  // Force full re-evaluation (e.g., after plugin register/unregister)
  invalidateAll(): void;
}

type ViewportRange = { startLine: number; endLine: number };

interface RenderUpdate {
  lineNumber: number;
  from: number;          // document offset
  to: number;            // document offset
  result: string | null; // formatted result for widget display
  error: string | null;
  inlineSolves: InlineSolveUpdate[];
}
```

#### 1.2.8 Memory Management — Page-Based LRU Eviction

- Group lines into **Pages** of 128 lines each
- Implement Page-level LRU cache:
  - **Hot pages** (viewport ± 3 pages): Keep bytecode + results in memory
  - **Warm pages** (recently visible): Keep bytecode, evict results
  - **Cold pages** (distant): Only keep `LineState` metadata (textHash, reads, writes). Evict bytecode.
- **Never evict:** Variable definition bytecode — these form the backbone of the DAG and VM checkpoints
- **Preload:** When user scrolls directionally, preload the next 1-2 pages in a background worker

#### 1.2.9 Concurrency Model

| Thread | Responsibilities | Constraint |
|--------|-----------------|------------|
| **Main Thread** | `LineCache` (bytecode + results), VM checkpointer, `setViewport` Tier 2 execution, widget rendering | Must never block > 1ms |
| **Web Worker** | `applyTransaction` heavy work: lexing, parsing, compiling, DAG computation | Ships `Uint8Array` bytecode via `postMessage` with Transferable objects (zero-copy) |

**Transferable objects:** When the worker compiles bytecode, it transfers the `ArrayBuffer` ownership to the main thread. This means zero-copy between threads — the bytes appear in the main thread without any serialization or duplication.

#### 1.2.10 Implementation Phases for This Section

| Phase | Description | Target |
|-------|-------------|--------|
| **1.2a** | ✅ `evaluateLines()` batch API (DONE) | 1 engine call per viewport |
| **1.2b** | DocumentModel with Segment Tree + LineState | O(log N) document updates |
| **1.2c** | Three-tier evaluation (Dirty/Cached/Track) | Background compilation, instant scroll |
| **1.2d** | VM State Checkpoints | O(1) scope restore for any line |
| **1.2e** | `setViewport()` zero-allocation execution | < 1ms viewport update |
| **1.2f** | Incremental `applyTransaction()` API | Handle CodeMirror changes natively |
| **1.2g** | Page-based LRU eviction + preloading | Bounded memory for 100K+ line docs |
| **1.2h** | Worker compilation + Transferable bytecode | Non-blocking main thread |

### 1.3 Lexer Performance

**Current State:** moo-based lexer with multiple states. The lexer recreates all rules in the constructor.

**Problems:**
- `MarkdownLexer.reset()` ignores the `state` parameter entirely — always resets to default
- Lexer rules are recreated on every `MarkdownLexer` construction (which happens once per engine, so minor)
- Regex-based tokenization is inherently slower than hand-written

**Plan:**
1. **Add fast integer/float detection** — Before entering the moo lexer, do a quick regex check: if the entire expression matches `/^[\d\s+\-*/().,]+$/`, skip moo entirely and use a simple hand-rolled tokenizer.
2. **Defer moo lexer construction** — Consider pre-compiling regexes once at module level rather than in the constructor.

### 1.4 Variable Chain Re-evaluation

**Current State:** `evaluateIncremental()` is **broken** — it calls `evaluateLineWithDebug(lineNumber, "")` with an empty string, so it can't re-evaluate anything. This explains the variable chain benchmark at 0.58ms (it's essentially a no-op that doesn't actually re-evaluate).

**Plan:**
1. **Fix `evaluateIncremental()`** — It needs the original expression text from the LineCache entry to re-evaluate.
2. **After fixing, re-benchmark** — The real incremental eval might be slower than we think. Set a new baseline.
3. **Consider DAG-walk optimization** — Instead of iterating all dirty lines through `getDirtyLines()`, walk the DAG from the changed variable to find exactly which lines to re-evaluate.

---

## Category 2: Code Quality and Type Safety

### 2.1 Eliminate `any` Types

**Production files affected (non-test, non-playground):**

| File | Instances | Fix |
|------|-----------|-----|
| `src/solve-js/src/engine/ExpressionEngine.ts` | 5 (`any[]`, `any`) | Use `Token[]`, `BytecodeProgram`, typed return |
| `src/app/eventbus/PluginEventBus.ts` | 4 (`any[]`) | Replace numeric event bus with typed events |
| `src/app/utilities/Logger.ts` | 6 (`any[]`) | Accept `unknown[]` and stringify |
| `src/solve-js/src/workers/WorkerInterface.ts` | 2 (`any`) | Define proper payload types per message type |
| `src/solve-js/src/workers/DataSourceStrategy.ts` | Use `ConfigurableWorker` as inline, not actual Web Worker | Needs complete rework |
| `src/solve-js/src/sources/HttpDataSource.ts` | 2 (`any`) | Generic constraint on parser function |
| `src/solve-js/src/services/DataQueryService.ts` | 4 (`any`) | Typed cache entries |
| `src/solve-js/src/uom/CurrencyExchange.ts` | 1 (`any`) | Typed handle |
| `src/app/workers/ObsidianWorker.ts` | 1 (`any`) | Typed callbacks |
| `src/app/workers/worker-entry.ts` | 2 (`any`) | Proper types |
| `src/app/workers/worker-entry.worker.ts` | 2 (`any`) | Proper types |
| `src/app/engine/SolveEvalWorker.ts` | 3 (`any`) | Proper types |
| `src/solve-js/src/types/ParsingResult.ts` | 2 (`any`) | Token type, BytecodeProgram type |
| `src/solve-js/src/workers/DataQueryWorker.worker.ts` | 4 (`any`) | Proper types |
| `src/solve-js/src/workers/default.ts` | 1 (`any`) | Proper module type |

**Total: ~37 `any` instances across 15+ production files. Target: 0.**

### 2.2 Fix Duplicate Interface Definitions

`src/solve-js/src/types/ParsingResult.ts` has a copy-paste error:
- `ParsedLine` is defined **3 times** identically
- `ParsingResult` is defined **3 times** (two with `DiagnosticReportJSON`, one with `DiagnosticReport`)
- `UnifiedParsingOptions` is defined **2 times**

**Fix:** Remove duplicates, keep one canonical definition of each.

### 2.3 Standardize Error Handling

**29+ violations** of `throw new Error()` instead of `throw ErrorFactory.xxx()` across production code.

| File | Violations | Fix |
|------|-----------|-----|
| `PluginSystem.ts` | 3 | `ErrorFactory.config()` |
| `Parser.ts` | 2 | `ErrorFactory.parsing()` — **this is in the hot path!** |
| `FunctionCallParselet.ts` | 1 | `ErrorFactory.execution()` |
| `VariableParselet.ts` | 1 | `ErrorFactory.parsing()` |
| `Configuration.ts` | 5 | `ErrorFactory.config()` |
| `ExpressionEngine.ts` | 2 | `ErrorFactory.execution()` |
| `types/core.ts` | 3 | `ErrorFactory.validation()` |
| `workers/default.ts` | 3 | `ErrorFactory.external()` |
| `workers/DataSourceStrategy.ts` | 2 | `ErrorFactory.external()` |
| `sources/HttpDataSource.ts` | 1 | `ErrorFactory.external()` |
| `services/DataQueryService.ts` | 1 | `ErrorFactory.external()` |
| `testUtils.ts` | 3 | Test-only — acceptable, but should be consistent |

### 2.4 Split Oversized Files

- **ExpressionEngine.ts (615 lines)** — Hard limit is 300. Split into:
  - `ExpressionEngine.ts` — public API, orchestration (~200 lines)
  - `ExpressionEngineSafety.ts` — safety checks, validation (~100 lines)  
  - `ExpressionEngineParsing.ts` — tokenization, parsing, bytecode compilation (~150 lines)
  - `ExpressionEngineCache.ts` — line cache, bytecode cache, buffer pool management (~100 lines)

- **VM.ts (350+ lines)** — Split into:
  - `VM.ts` — VM creation and execution loop (~200 lines)
  - `VMBuiltins.ts` — builtin function table (~60 lines)
  - `VMConversion.ts` — `unifyUom`, type conversion helpers (~80 lines)

### 2.5 Remove Dead/Vestigial Code

| File | Status | Action |
|------|--------|--------|
| `src/solve-js/src/vm/MemoCache.ts` | "Consolidated into LineCache" but file still exists | Delete |
| `src/solve-js/src/cache/UnifiedCache.ts` | Generic cache with LRU/LFU/TTL — unused by engine | Delete or move to `src/solve-js/src/cache/LFUCache.ts` — only one should remain |
| `src/solve-js/src/cache/LFUCache.ts` | LFU cache — unused? | Audit usage. If unused, delete |
| `src/solve-js/src/lexer/ExpressionLexer.ts` | Thin wrapper around MarkdownLexer — unused? | Audit usage. If unused, delete |
| `ExpressionEngine.getMemoCache()` | Throws "consolidated" error | Remove method entirely |
| `ExpressionEngine.parseDocumentLean()` | Deprecated | Remove |

---

## Category 3: Architecture Consolidation

### 3.1 Consolidate Worker Entry Points

**Current State:** Three near-identical worker files:
1. `src/app/workers/worker-entry.ts` — imports from `../../solve-js/src/`
2. `src/app/workers/worker-entry.worker.ts` — imports from `@solve-js/`
3. `src/app/engine/SolveEvalWorker.ts` — more complete, supports SET_LOCALE, REGISTER_PLUGIN

All three create an ExpressionEngine, handle EVAL/EVAL_DOC messages, and post back results.

**Plan:**
1. **Create single canonical worker at `src/solve-js/src/workers/eval-worker.ts`** — This is the npm-package worker. It should be the most complete implementation.
2. **Wire it into Obsidian** — The Obsidian layer should re-export or reference this worker, not duplicate it.
3. **Delete the other two** — `worker-entry.ts` and `worker-entry.worker.ts` in `src/app/workers/`.
4. **Standardize the message protocol** — Define a single `WorkerProtocol` type that both main thread and worker import.

### 3.2 Consolidate Cache Layers

**Current State:** 
- `LineCache` — per-line result + bytecode cache with epoch-based invalidation
- `MemoCache` — "consolidated into LineCache" but class still exists
- `UnifiedCache` — generic cache with LRU/LFU/TTL policies — appears unused by engine
- `LFUCache` — simpler LFU cache — appears unused by engine

**Plan:**
1. **Delete `MemoCache`** — Already marked as consolidated. Remove the file and all references.
2. **Delete `UnifiedCache` or `LFUCache`** — Keep one generic cache utility if it's actually used. Delete the other.
3. **Audit LineCache for completeness** — Ensure the epoch-based invalidation fully replaces MemoCache's functionality.

### 3.3 Prepare for npm Package Extraction

**Goal:** `solve-js` becomes a standalone npm package.

**Requirements:**
1. **Clean package boundary** — `src/solve-js/` must have zero dependencies on `src/app/`
2. **Own `package.json`** — With proper exports, types, and build config
3. **Self-contained worker** — The Web Worker entry should be bundled within the package
4. **External API stability** — `SolveAPI.ts`, `PluginSystem.ts`, `ExpressionEngine` public API
5. **Remove path aliases** — `@solve-js/*` and `@app/*` won't work for external consumers. Use proper relative imports or an exports map.

---

## Category 4: Correctness Fixes

### 4.1 Fix `evaluateIncremental()`

**Bug:** Calls `evaluateLineWithDebug(lineNumber, "")` — passes empty string instead of expression text.

**Fix:** Retrieve the original expression from `LineCache.getEntryForLine(lineNumber)` and use `entry.bytecode` to re-execute directly (avoid re-parsing).

### 4.2 Fix `buildInto()` Zero-Copy

**Bug:** Uses `buf.opcodes.slice(0, opLen)` which **copies** the buffer. The entire point of `buildInto()` was to avoid copies, but `.slice()` creates a new TypedArray.

**Fix:** Store length alongside the pooled buffer. Return a view over the buffer using `new Uint8Array(buf.opcodes.buffer, 0, opLen)` — this shares the underlying ArrayBuffer without copying.

### 4.3 Fix `MarkdownLexer.reset()` Ignores State

**Bug:** `reset(input, state?)` ignores the `state` parameter entirely.

**Fix:** Respect the state parameter. If not provided, use the initial state.

### 4.4 Fix Parser `consume()` Error Handling

**Bug:** `consume()` and `match()` throw plain `Error` instead of `SolveError`.

**Fix:** Use `ErrorFactory.parsing()`.

### 4.5 Fix `isEmptyLine()` Simplistic Check

**Bug:** Only checks for whitespace, `#`, `>`, `-`, `*`, `+` at line start. Doesn't handle:
- Code blocks (```)
- MathJax blocks ($$)
- Table rows (|...|)
- Obsidian-specific syntax (callouts, embeds, wikilinks)

**Fix:** Use the lexer's markdown state to detect truly empty/skip-worthy lines at the token level. Or expand the regex to cover more Obsidian-specific markdown.

### 4.6 Fix `evaluateNumber()` Undefined Variable Detection

**Bug:** Checks if result is 0 AND expression is a word character pattern, then checks if VM has the variable. But variables that are explicitly set to 0 would also return NaN.

**Fix:** Track whether a variable was explicitly set vs undefined. Use a sentinel or a separate lookup.

---

## Category 5: Provider Completeness

### 5.1 Full Grammar Rule Coverage

Per `TODO.MD` item #4, the new engine's providers don't cover all the grammar rules from the original ohm-based implementation. Need to:

1. **Audit every provider** against the original at https://github.com/LiamRiddell/obsidian-solve/wiki/Core-Providers
2. **Write tests for every rule** — as seen in https://github.com/LiamRiddell/obsidian-solve/tree/main/test/providers
3. **Specific gaps noted in TODO.MD:**
   - "None of the word-based variations are missing" — need to add word-based operators like "divided by", "multiplied by", etc.
   - Vector parselet uses `[1, 2, 3]` but should use `(x, y, n+1)` per original implementation
   - Big integer tests are missing
   - Units of Measurement doesn't handle all original functionality

### 5.2 Provider-Specific Tasks

| Provider | Tasks |
|----------|-------|
| Arithmetic | Verify binary ops, unary ops, constants (pi, e), grouping |
| Percentage | Verify `X% of Y`, `X% increase/decrease`, `X + Y%`, `X - Y%` |
| Function | All 37 builtin functions tested; verify argument count validation |
| Datetime | `Now`, `Today`, `Tomorrow`, `Yesterday`, `Next/Last X`, `X days/weeks/months/years ago/from now`, `since/until` |
| UoM | All unit categories (distance, mass, volume, temp, time, area, speed, data, etc.) |
| Vector | Fix syntax from `[x,y,z]` to `(x,y,z)`; add `Vector3`, cross product |
| BigInteger | Add tests; ensure suffix `n` works; bitwise operations |
| Dice | `XdY`, `dY`, range notation; ensure random seed for testing |
| Variables | `:name = expr`, inline commits, scoping rules |

### 5.3 Lexer Completeness

Per `TODO.MD` item #10:
- Handle **all Obsidian markdown** — callouts, embeds, wikilinks, tags, footnotes
- Handle **MathJax** blocks and inline math (`$...$` and `$$...$$`)
- Skip code blocks, comments efficiently
- Handle incomplete/broken markdown without crashing

---

## Category 6: Testing and Benchmarks

### 6.1 Test Coverage Gaps

Per `TESTING_GUIDELINES.md` targets:

| Module | Target | Action |
|--------|--------|--------|
| VM (core) | 95% | Add edge case tests: stack overflow, instruction limit, NaN propagation, all ValueTypes |
| Parser | 90% | Add error recovery tests, nested expression stress tests |
| Lexer | 85% | Add fuzz testing, markdown edge cases, Obsidian-specific syntax |
| Engine | 85% | Add cache coherence tests, document re-parse tests, worker fallback tests |
| Providers | 80% each | Add per-provider comprehensive tests matching ohm-era coverage |
| Error framework | 90% | Test all ErrorFactory methods, ErrorRecoveryManager |

### 6.2 Missing Test Categories

1. **Worker integration tests** — Test the full worker round-trip
2. **Provider breakage tests** — Verify that unregistering a plugin cleans up properly
3. **Cache coherence tests** — Verify that bytecode cache, line cache, and DAG stay in sync
4. **Concurrent modification tests** — Verify engine handles rapid document changes
5. **Memory leak tests** — Run 10,000 iterations and check memory doesn't grow

### 6.3 Benchmark Improvements

1. **Add separate warm/cold/hot benchmarks** — cold (new engine), warm (cached bytecode), hot (same expression re-eval)
2. **Add regression detection** — CI must fail if any benchmark exceeds threshold
3. **Add memory benchmarks** — Track allocations per eval
4. **Profile-driven optimization** — Use Node.js `--prof` to find real bottlenecks before optimizing

---

## Phase Plan

### Phase 1: Code Quality Foundation (Week 1)
**Goal:** Zero `any` types, zero `throw new Error()` violations, zero duplicate code.

- [x] Fix all `any` types in production code — ✅ 26 instances fixed across 10 files (commit cc1510c). Remaining: worker .ts files + DataQueryService (7 instances, needs deeper refactor)
- [x] Fix all `throw new Error()` violations (29+ instances → ErrorFactory) — ✅ 22 production violations fixed across 12 files (commits 5df64f7, [pending])
- [x] Remove duplicate interface definitions in ParsingResult.ts
- [ ] Delete dead files: ~~MemoCache.ts~~ ✅, ExpressionLexer.ts (audit), UnifiedCache.ts (keep one)
- [x] Remove deprecated methods: `getMemoCache()`, `parseDocumentLean()`

### Phase 2: Architecture Cleanup (Week 1-2)
**Goal:** Clean boundaries, consolidated workers, ready for npm extraction.

- [ ] Consolidate 3 worker entry points into 1 canonical file
- [ ] Standardize worker protocol types
- [ ] Split ExpressionEngine.ts (615 → ~200 lines, with helpers)
- [ ] Split VM.ts (350 → ~200 lines, with helpers)
- [ ] Audit and fix `buildInto()` zero-copy
- [ ] Remove `.slice()` in buildInto — use true buffer reuse

### Phase 3: Correctness Fixes (Week 2)
**Goal:** Fix all known bugs.

- [ ] Fix `evaluateIncremental()` — broken (empty string)
- [ ] Fix `MarkdownLexer.reset()` — ignored state parameter
- [ ] Fix Parser `consume()` error handling
- [ ] Fix `isEmptyLine()` — handle full Obsidian markdown
- [ ] Fix `evaluateNumber()` zero-vs-undefined distinction
- [ ] Audit all providers for regression from ohm-era implementation

### Phase 4: Provider Completeness (Week 2-3)
**Goal:** Every provider rule from the original implementation has a passing test.

- [ ] Write comprehensive provider tests matching ohm-era coverage
- [ ] Add missing word-based operator variations
- [ ] Fix vector syntax: `[x,y,z]` → `(x,y,z)`
- [ ] Add big integer tests
- [ ] Complete UoM grammar rules

### Phase 5: Performance Optimization (Week 3-4)
**Goal:** Hit nanosecond targets, instant scrolling at 60fps.

**VM Hot Loop (5.1):**
- [ ] Cache `toNumber()` on Value
- [ ] Add numeric fast path in binaryOp
- [ ] Move trace check out of VM hot loop
- [ ] Fix buffer pool reuse (true zero-copy)
- [ ] Add integer-only fast path in lexer
- [ ] Consider computed dispatch table for VM

**Document Engine (5.2):**
- [ ] 5.2a: `evaluateLines()` batch API ✅
- [ ] 5.2b: DocumentModel with Segment Tree + LineState
- [ ] 5.2c: Three-tier evaluation (Dirty/Cached/Track)
- [ ] 5.2d: VM State Checkpoints with structural sharing
- [ ] 5.2e: `setViewport()` zero-allocation execution
- [ ] 5.2f: `applyTransaction()` incremental update API
- [ ] 5.2g: Page-based LRU eviction + preloading
- [ ] 5.2h: Worker compilation + Transferable bytecode

- [ ] Re-benchmark after each optimization

### Phase 6: Testing & Validation (Week 3-4)
**Goal:** 90%+ coverage on all core modules, all regression thresholds passing.

- [ ] Add missing test categories (workers, cache coherence, memory)
- [ ] Run full test suite with coverage
- [ ] Profile performance and compare to baselines
- [ ] Fix any regressions

### Phase 7: npm Package Extraction (Week 4)
**Goal:** `solve-js` ships as a standalone npm package.

- [ ] Create `src/solve-js/package.json`
- [ ] Define public API surface
- [ ] Replace path aliases with proper imports
- [ ] Bundle workers within package
- [ ] Write package README, API docs
- [ ] Test external consumption

---

## Quick Wins (Do First)

### ✅ Completed (commit `5df64f7`)

1. ✅ **Fix duplicate interfaces in ParsingResult.ts** — 3× ParsedLine, 3× ParsingResult, 2× UnifiedParsingOptions → 1 each
2. ✅ **Delete MemoCache.ts** — File deleted, export removed from vm/index.ts, test deleted
3. ✅ **Remove deprecated getMemoCache() and parseDocumentLean()** — Dead API surface cleaned
4. ✅ **Fix throw new Error() in Parser.ts** — Replaced with ErrorFactory.parsing()
5. ✅ **Fix MarkdownLexer.reset() state parameter** — Removed incompatible LexerState enum parameter (moo uses save-point, not state-machine)
6. ✅ **Standardize throw new Error() in Configuration.ts** — 5 replacements with ErrorFactory.config() + test
7. ✅ **Added Configuration.spec.ts** — Verifies error types are SolveError with ErrorCategory.CONFIG

### ✅ Completed (commit `b332038`)

8. ✅ **evaluateLines() batch API** — Single engine call processes all visible lines, sharing VM state and bytecode cache
9. ✅ **Refactored buildDecorations()** — Three-phase: collect uncached → batch-evaluate → render
10. ✅ **Added buildLineDecorationsFromParsed()** — Eliminates duplicate parseDocument() per line
11. ✅ **Added EvaluateLines.spec.ts** — Test cases for batch evaluation

### ✅ Completed (commit `5e1a145`)

12. ✅ **Standardize all remaining `throw new Error()` violations** — 15 violations across 10 files fixed:
    - PluginSystem.ts (3×) → ErrorFactory.config()
    - FunctionCallParselet.ts (1×) → ErrorFactory.execution()
    - VariableParselet.ts (1×) → ErrorFactory.parsing()
    - ExpressionEngine.ts (1×) → ErrorFactory.execution()
    - types/core.ts (3×) → ErrorFactory.validation()
    - workers/default.ts (4×) → ErrorFactory.external()
    - workers/DataSourceStrategy.ts (2×) → ErrorFactory.external()
    - sources/HttpDataSource.ts (1×) → ErrorFactory.external()
    - services/DataQueryService.ts (1×) → ErrorFactory.external()
    - app/workers/ObsidianWorker.ts (1×) → ErrorFactory.external()

### ✅ Completed (commit `cc1510c`)

13. ✅ **Eliminate `any` types in ~26 locations** — Logger.ts, PluginEventBus.ts, Configuration.ts, CurrencyExchange.ts, ExpressionEngine.ts, ParsingResult.ts, HttpDataSource.ts, WorkerInterface.ts, workers/default.ts, ObsidianWorker.ts
14. ✅ **Fix debug access guards in test files** — 3 test files updated for `any → DiagnosticReportJSON | undefined`

### ✅ Completed (commit [pending])

15. ✅ **Eliminate remaining `any` in worker files (~11 instances)** — worker-entry.ts, worker-entry.worker.ts, SolveEvalWorker.ts, DataQueryWorker.worker.ts; typed WorkerPostMessage + WorkerMessage interfaces
16. ✅ **Eliminate `any` in DataQueryService.ts (7 instances)** — data: unknown throughout cache, pendingQueries, callbacks, plugin; Promise<any> → Promise<unknown>
17. ✅ **Fix CurrencyExchange.ts type narrowing** — as Promise<number>, as number|null for unknown returns from DataSourceHandle

### Remaining Quick Wins

18. **Add .npmrc and package boundaries** — Prep for npm extraction
19. **Audit and delete remaining dead files** — ExpressionLexer.ts, UnifiedCache.ts/LFUCache.ts

---

## Questions for User

1. **Vector syntax:** Original uses `(x, y, z)` not `[x, y, z]`. Should we switch? This would be a breaking change for any users relying on bracket syntax.
2. **Cache consolidation:** Should we delete both UnifiedCache and LFUCache (neither appears used by engine)? Or keep one as a utility?
3. **Worker protocol:** Should the canonical worker protocol be defined in the solve-js package or in a shared types file?
4. **Test migration:** Should we port the ohm-era provider tests directly, or rewrite them for the new architecture?
5. **Node.js compatibility:** Should the npm package work in Node.js (server-side), or only in browser/Worker contexts?

---

*This plan is exhaustive but modular — each phase can be worked on independently. Every task has a clear acceptance criterion and can be verified by the existing test suite + new tests.*
