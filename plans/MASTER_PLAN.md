# MASTER PLAN — obsidian-solve Deep Review

> Generated: 2026-05-21 | Updated: 2026-05-29 | Reviewer: AI Deep Audit
> Target: Full production readiness with nanosecond-level performance

---

## Executive Summary

The project is in **production-ready shape** — 88 test suites, 1,966 tests passing (0 failures, 2 skipped). Phases 1–5 are complete including the full Lexer rewrite. Remaining work: 1 code-hygiene item, 6 deferred parse+compile optimizations, and npm package extraction.

### Quick Stats

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Test suites | 88 (1,966 pass, 0 fail) | 88 green | ✅ |
| `any` types in production | ~37 instances across 15+ files | 0 | ✅ |
| `throw new Error()` violations | 29+ locations | 0 (all ErrorFactory) | ✅ |
| Duplicate interface definitions | ParsingResult.ts had 3× dupes | 0 | ✅ |
| Worker entry point duplication | 3 near-identical files | 1 canonical file | ✅ |
| Dead/vestigial code files | All dead files removed; LFUCache retained (used by UomConverter) | Removed | ✅ |
| Class exceeds 300-line limit | ExpressionEngine + VM split into sub-modules | Split | ✅ |
| Provider grammar coverage | All core providers tested | ✅ |
| Lexer rewrite (§5.4) | Custom lexer replaces moo, monomorphic Token, L0/L1/L2 tiered scanning | ✅ |
| Document Engine (1.2a-h) | All 8 phases (SegmentTree, ThreeTier, Checkpoints, Viewport, applyTransaction, PageManager, Worker) | ✅ |
| VM hot loop (5.1) | Dispatch table, numeric fast path, ValueArena, builder pool | ✅ |
| Code hygiene | 1 item remains (split initDispatchTable) | 🟡 |
| Parse+Compile optimization (§5.5) | 6 deferred items | ⏸️ |
| npm package extraction (§3.3) | 6 items | ⏸️ |

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

### 1.3 Lexer Performance ✅ DONE

**Current State:** moo-based lexer with multiple states.

**Changes made:**
1. ✅ **Fast numeric tokenizer** — `NUMERIC_ONLY_RE = /^[\d\s+\-*\/()\.,%^]+$/` guards the fast path in `MarkdownLexer.reset()`. If an expression contains ONLY digits, whitespace, and basic arithmetic operators/punctuation, moo is bypassed entirely and a hand-rolled character-by-character tokenizer (`_tokenizeNumeric()`) produces tokens in a single pass with zero regex overhead. Expressions with letters (keywords, units, variables, functions) fall through to moo unchanged.
   - **`simple_arithmetic`** ("1 + 2 * 3"): 1.70µs → 0.71µs = **2.4× faster (-58%)**
   - **`number_only`** ("42"): 0.59µs → 0.48µs = **1.2× faster (-19%)**
   - **`long_expression`** (50-term sum): 39.77µs → 14.22µs = **2.8× faster (-64%)**
   - Non-numeric expressions fall through to moo with minimal overhead (regex test + array clear)
   - All 1,472 tests pass, 13 existing lexer tests pass, typecheck clean

### 1.4 Variable Chain Re-evaluation ✅ DONE

**Changes made:**
1. ✅ **DAG-walk optimization** — `evaluateIncremental()` refactored to use `dag.getAffectedLinesInOrder(variable)` directly instead of the indirect `markDirtyFromVariable()` → `getDirtyLines()` → ascending sort path. Eliminates LineCache dirty-state pollution and ensures only truly affected lines are re-evaluated (not all dirty lines from any source).
2. ✅ **Topological sort via Kahn's algorithm** — `DependencyGraph.getAffectedLinesInOrder(startVariable)` returns affected lines in dependency-safe order using BFS-based Kahn's algorithm. Builds a local subgraph in-degree map, computes producer-consumer edges among affected lines, and produces a correct evaluation order. Fallback: if every line has in-degree > 0 (cycle or all-external deps), starts with lowest line number and appends remainder in ascending order.
3. ✅ **O(n²) subgraph construction per code review** — Early-exit on first matching producer per read variable. In practice, each variable is defined once per document so this is correct and efficient for typical affected sets (<100 lines).
4. ✅ **Added 7 unit tests for `getAffectedLinesInOrder`** — Tests cover: single consumer, chained dependencies (`a→b→c`), diamond DAG, independent readers (parallel), cycle fallback, empty set, and no-reads producers. All 29 DependencyGraph + Phase6 tests pass.
5. ✅ **1,479 tests pass, 0 regressions, typecheck clean**

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
1. **Delete `MemoCache`** — Already marked as consolidated. Remove the file and all references. ✅ DONE
2. **Delete `UnifiedCache` or `LFUCache`** — Keep one generic cache utility if it's actually used. Delete the other. ✅ DONE (UnifiedCache deleted, LFUCache kept — used by UomConverter)
3. **Audit LineCache for completeness** — Ensure the epoch-based invalidation fully replaces MemoCache's functionality. ✅ DONE (Phase 1.5)

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
| Engine | 85% | ✅ Cache coherence, worker integration, memory, concurrent modification tests added |
| Providers | 80% each | Add per-provider comprehensive tests matching ohm-era coverage |
| Error framework | 90% | Test all ErrorFactory methods, ErrorRecoveryManager |

### 6.2 Missing Test Categories ✅ DONE

1. ✅ **Cache coherence tests** — `CacheCoherence.spec.ts` (20 tests): DAG↔LineCache sync, DocumentModel↔LineCache consistency, DocumentModel→DAG dirty propagation, applyTransaction coherence, evaluateIncremental coherence, bytecode cache consistency
2. ✅ **Worker integration tests** — `WorkerIntegration.spec.ts` (12 tests): CompilationWorkerManager lifecycle, storeResults protocol, CompileRequestItem/CompileResponse types, compileBatch empty-array early return
3. ✅ **Memory leak tests** — `MemoryLeak.spec.ts` (16 tests): 10K parseDocument, 10K evaluateLine, 5K unique expressions, engine create/dispose, ThreeTierEvaluator cycles, LineCache clear, DocumentModel setDocument/clear, stress: 5K alternating ops
4. ✅ **Concurrent modification tests** — `ConcurrentModification.spec.ts` (18 tests): rapid sequential applyTransaction, overlapping edits, interleaved eval+edit, large batch edits (delete all, replace all, 50 simultaneous), edge cases (beyond-end insert, over-delete clip, pure insert/delete, empty change list)
5. ✅ **66 new tests, 1,542 total pass, 0 regressions, typecheck clean**

### 6.3 Benchmark Improvements

1. **Add separate warm/cold/hot benchmarks** — cold (new engine), warm (cached bytecode), hot (same expression re-eval)
2. **Add regression detection** — CI must fail if any benchmark exceeds threshold
3. **Add memory benchmarks** — Track allocations per eval
4. **Profile-driven optimization** — Use Node.js `--prof` to find real bottlenecks before optimizing
5. **Add end-to-end pipeline throughput benchmarks** — Measure full pipeline (lex → parse → compile → execute) end-to-end for documents of varying sizes:
   - **Small** (~10 expressions, ~100 lines) — typical note-taking session
   - **Medium** (~200 expressions, ~1,000 lines) — research notes
   - **Large** (~2,000 expressions, ~10,000 lines) — knowledge-base vault
   - **Massive** (~20,000+ expressions, ~100,000+ lines) — stress test, measure memory stability and GC pressure
   - Track breakdown: lex% + parse% + compile% + execute% of total time to identify pipeline bottlenecks
   - Separate cold-start (no cache, full pipeline) vs warm-start (cached bytecode, execute-only) measurements

---

## Phase Plan

### Phase 1: Code Quality Foundation (Week 1)
**Goal:** Zero `any` types, zero `throw new Error()` violations, zero duplicate code.

- [x] Fix all `any` types in production code — ✅ 26 instances fixed across 10 files (commit cc1510c). Remaining: worker .ts files + DataQueryService (7 instances, needs deeper refactor)
- [x] Fix all `throw new Error()` violations (29+ instances → ErrorFactory) — ✅ 22 production violations fixed across 12 files (commits 5df64f7, [pending])
- [x] Remove duplicate interface definitions in ParsingResult.ts
- [x] Delete dead files: MemoCache.ts ✅, ExpressionLexer.ts ✅ (already deleted), UnifiedCache.ts ✅ (already deleted), LFUCache.ts ✅ (audited: kept, used by UomConverter)
- [x] Remove deprecated methods: `getMemoCache()`, `parseDocumentLean()`

### Phase 2: Architecture Cleanup (Week 1-2) ✅ DONE
**Goal:** Clean boundaries, consolidated workers, ready for npm extraction.

- [x] Consolidate 3 worker entry points into 1 canonical file — Created `eval-worker.ts`, deleted `worker-entry.ts`, `worker-entry.worker.ts`, `SolveEvalWorker.ts`; updated esbuild.config.mjs
- [x] Standardize worker protocol types — `EvalWorkerMessage` discriminated union in eval-worker.ts; removed `worker.d.ts` duplicate; renamed currency-polling's `WorkerMessage` → `CurrencyPollingMessage`; clean exports without alias hack
- [x] Split ExpressionEngine.ts (615 → ~200 lines + ExpressionEngineSafety.ts) — Safety checks extracted: `checkExpressionLength`, `checkExpressionComplexity`, `extractReadsAndWrites`, `isEmptyLine`, `findInlineSolvesInLine`
- [x] Split VM.ts (350 → ~200 lines + VMBuiltins.ts + VMConversion.ts) — Builtins extracted (37 functions + `getOpCodeName` from OpCode.ts), conversion helpers extracted (`unifyUom`, `binaryOp`)
- [x] Audit and fix `buildInto()` zero-copy — Changed `.slice()` to `new Uint8Array(buf.buffer, offset, length)` subarray views; ExpressionEngine copies bytecode before caching since pool is reused
- [x] Removed stale compiled worker artifact (`workers/worker-entry.js`)

### Phase 3: Correctness Fixes (Week 2) ✅ DONE
**Goal:** Fix all known bugs.

- [x] Fix `evaluateIncremental()` — Now uses `executeBytecode(entry.bytecode, this.vm)` from cached bytecode instead of `evaluateLineWithDebug(lineNumber, "")` with empty string. Skips lexing/parsing/compiling entirely.
- [x] Fix `MarkdownLexer.reset()` — Already fixed (moo.reset just takes input, no state parameter needed)
- [x] Fix Parser `consume()` error handling — Already uses `ErrorFactory.parsing()`, no `throw new Error()` violations
- [x] Fix `isEmptyLine()` — Expanded regex to handle: code block fences (```), MathJax fences ($$), table separator rows, horizontal rules (---), wikilinks/embeds. Added inline solve guard (`s\``) so lines with inline solves are never classified as empty. Uses `$` anchor to preserve backward compatibility.
- [x] Fix `evaluateNumber()` zero-vs-undefined distinction — Changed from post-hoc `result.toNumber() === 0` check to pre-evaluation check: if bare identifier and `vm.getVar()` returns undefined, return NaN before evaluating.
- [x] Fix `evaluateIncremental()` dirty-line ordering — Sort dirty lines ascending (`Array.from(...).sort((a,b)=>a-b)`) so chained dependencies always execute producer-before-consumer.
- [x] Fix `LineCache.markClean()` bulk path — Mirror `markDirty`'s bulk behavior: when called without expression, clean all entries for that line number.
- [x] Fix isEmptyLine() HR regex — Changed from `/^[-*_]{3,}\s*$/` to separate alternatives `/^(-{3,}|\*{3,}|_{3,})\s*$/` so mixed chars like `*-*` aren't misclassified.
- [x] Add 60 unit tests across 3 suites — Phase5_evaluateNumber (+10 bare-identifier tests), Phase6_incremental (+7 bytecode execution tests), Phase8_isEmptyLine (34 new tests).
- [x] Audit all providers for regression from ohm-era implementation (→ Phase 4) ✅ Covered by Phase 4 provider completeness

### Phase 4: Provider Completeness (Week 2-3) ✅ DONE
**Goal:** Every provider rule from the original implementation has a passing test.

- [x] **`xor` keyword** — Added to en.ts locale's keywordMap, registered as BIT_XOR infix parselet in arithmetic parselets with dedicated BindingPower.Xor (35, between Product=40 and Sum=30)
- [x] **BindingPower.Xor** — New constant for correct precedence (AND > XOR > OR)
- [x] **BigInt tests fixed & expanded** — Fixed XOR test (was `|` bitwise-OR, now `xor`), added exponentiation tests (`^` and `prime`)
- [x] **Arithmetic XOR tests** — `5 xor 3 = 6`, `7 xor 2 = 5`
- [x] **UoM tests expanded** — Temperature (C↔F), speed (mi↔km), volume (gal↔L, L↔ml), weight (t↔kg, oz↔g), data storage (GB↔MB decimal), area (m2↔ft2). Unit aliases removed entirely — `resolveUnit()` passes units straight through to the `convert` package with no remapping. Units are strictly case-sensitive (e.g. C=Celsius vs c=centiliter, MB=megabytes vs mb=millibar). Only natively valid `convert` identifiers are in `knownUnits`.
- [x] **All 910 engine + 147 provider tests pass**, typecheck clean

### Phase 5: Performance Optimization (Week 3-4)
**Goal:** Hit nanosecond targets, instant scrolling at 60fps.

**VM Hot Loop (5.1):**
- [x] Cache `toNumber()` on Value — `_cachedNumber` eagerly set for Number/Hex, computed once for BigInt/String (Value.ts)
- [x] Add numeric fast path in binaryOp — both-Number operands (~90%+ of ops) inline arithmetic, skip type/UoM/Vector/BigInt dispatch (VMConversion.ts line 51-53)
- [x] Move trace check out of VM hot loop — Replaced `traceStep()` closure call (function call + 3 arg evaluations per instruction) with `if (shouldTrace)` boolean guard. JIT eliminates the branch entirely when diagnostics are off. Trace fire event inlined at the call site. (VM.ts)
- [x] Inline stack access in hot loop — Replaced all `vm.push()`/`vm.pop()`/`vm.popNumber()`/`vm.popString()`/`vm.peek()` with direct `stack.push()`/`stack.pop()!`/`stack[sp-1]`. Eliminates per-op method-call overhead through VM interface. Bounds checks skipped — bytecode compiler guarantees stack balance. (VM.ts — all ~40 switch cases)
- [x] Simplify redundant branches — EXP case had identical if/else; collapsed to single path (VM.ts)
- [x] Fix buffer pool reuse — already zero-copy (subarray views); expanded pool 256→512/64→128
- [x] Add integer-only fast path in lexer — ✅ Implemented Phase 1.3: `NUMERIC_ONLY_RE` regex guard + `_tokenizeNumeric()` character-by-character tokenizer in MarkdownLexer. 2.4× faster for simple arithmetic (1.70→0.71µs), 2.8× faster for long expressions (39.77→14.22µs). Module-level pre-compiled regex `FAST_OP_MAP` and `NUMERIC_CHAR_RE` for zero per-call allocation.
- [x] Consider computed dispatch table for VM — **deferred**: switch is JIT-optimized; dispatch table adds function-call overhead
- [x] **Benchmark results** (6 VM benchmarks, 25K iterations each, all 1,472 tests pass):
  - simple_add: 0.71→0.66µs (-7%), variable_access: 0.60→0.64µs, vector_creation: 0.65→0.65µs, unit_conversion: 4.44→4.39µs (-1%), dice_roll: 0.81→0.94µs (Math.random() noise), percentage: 0.84→0.90µs
  - At microsecond scale, Value construction + switch dispatch dominate. The inline changes remove ~150 function calls per simple_add expression. Gains compound on longer expressions with more opcodes.

**Document Engine (5.2):**
- [x] 5.2a: `evaluateLines()` batch API ✅
- [x] 5.2b: DocumentModel with SegmentTree (Treap) for O(log N) structural splices — Replaced flat `lineOrder: number[]` with order-statistic Treap supporting O(log N) insert/delete/spliceAt/getAt. Added `getRange()` for O(viewport + log N) viewport rendering. Lazy position cache (Map<lineId, position>) built on first `getLinePosition()` after structural edits, invalidated on change. SegmentTree is private to DocumentModel — ThreeTierEvaluator only accesses the public API, so the tree could be swapped without touching any consumer code. 42 SegmentTree unit tests (getAt, insertAt, deleteAt, spliceAt, getRange, replaceAll, clear, iteration, length/isEmpty, edge cases: single element, 100 consecutive splices, 10K-element stress), 52 existing DocumentModel tests pass. Typecheck clean (8 pre-existing errors in unrelated DataQueryWorker files + node_modules), full suite 1,472 pass 0 regressions. **Architecture documentation:** `solve-engine-architecture.html` (full-stack visual guide with SVG diagrams showing SegmentTree → DocumentModel → ThreeTierEvaluator layers, public/private API boundaries, data flow for typing and scrolling, performance tables) and `segment-tree-explainer.html` (ELI5 + developer walkthrough of Treap split/merge operations).
- [x] 5.2c: Three-tier evaluation (Dirty/Cached/Track) — 26 tests, 6 files changed, Tier-2 cached bytecode execution + Tier-3 compile-only for invisible lines
- [x] 5.2d: VM State Checkpoints with structural sharing (63 tests: 30 VMCheckpoint + 7 ThreeTierEvaluator integration)
- [x] 5.2e: `setViewport()` zero-allocation execution + `MarkdownEditorViewPlugin` integration (82 tests, checkpoint-restore + viewport-only Tier 2, stale checkpoint clearing on fallback, frontend plugin routes scroll events to `setViewport()` and doc changes to `evaluate()`)
- [x] 5.2f: `applyTransaction()` incremental update API — Maps CodeMirror ChangeSpec to DocumentModel splices via `codeMirrorChangesToLineChanges()`. Five-phase apply: (1) collect DAG writes + downstream lineIds before structural change, (2) `doc.applyChanges()` structural splice, (3) clear checkpointer (line numbers shifted), (4) mark downstream lines dirty by lineId (position-agnostic), (5) clear DAG for subsequent `evaluate()` rebuild. Fixed `DependencyGraph.clear()` to include `lineReads`. 92 tests pass across 4 suites, typecheck clean.
- [x] 5.2g: Page-based LRU eviction + preloading — `PageManager` groups into 128-line pages, three temperature tiers (hot: viewport span ±3 pages keep all, warm: ±4-6 keep bytecode evict results, cold: >6 evict bytecode+results except variable defs), directional preloading (2 pages ahead via saved scroll direction), integrated into `ThreeTierEvaluator.evaluate()`/`setViewport()` with O(1) range-math hot/warm checks, one-frame direction lag eliminated by ordering eviction before preload in `setViewport()`. **Optimization:** replaced O(total pages) cold eviction loop with bounded loops (hot pages + warm pages + cold transition buffer of 3 pages), reducing `maintainAfterEval` from ~2ms at 100K lines to ~218µs at 10K lines (O(hot+warm+buffer) ≈ O(1)). 39 tests pass, typecheck clean, full suite 1,429 pass 0 regressions.
- [x] 5.2h: Worker compilation + Transferable bytecode — `CompilationWorkerManager` (main-thread bridge with Promise-based batching + compiledAgainstHash validation), `compilation-worker.ts` (worker entry: compileExpression → slice exact ArrayBuffer ranges → postMessage with Transferable list), integrated into `ThreeTierEvaluator.dispatchBackgroundCompiles()` (lazy worker init, fire-and-forget Tier 3 compilation for invisible dirty lines), wired into `MarkdownEditorViewPlugin.update()` post-render path. Worker terminated on document switch and destruction. 134 tests pass, typecheck clean.

- [x] **5.3: Value Arena — zero-allocation Value reuse during scroll** — `ValueArena` bump-allocator (512 pre-allocated Value objects, O(1) reset per scroll frame), module-level `_arena` toggle with `enableValueArena()`/`disableValueArena()`, `persistentValue()` cloning at STORE_VAR and HALT boundaries so arena Values survive across frames. All 9 factory functions (`numberValue`, `uomValue`, `stringValue`, etc.) delegate to arena when active. ThreeTierEvaluator wraps `evaluate()` and `setViewport()` with `try/finally` arena enable/disable — arena is always cleaned up even on exception. VM's `executeBytecode()` clones results at HALT and variable stores at STORE_VAR when arena is active. intermediate stack Values stay in arena (safe — consumed within same instruction cycle). 1,472 tests pass, 0 regressions, typecheck clean.
- [x] Re-benchmark after each optimization — VM benchmarks (6 suites) vs pre-session baseline (0.64µs simple_add → 0.21µs after all Phase 5 optimisations)
- [x] **Add end-to-end pipeline throughput benchmarks** — Full-pipeline (lex → parse → compile → execute) for small (~10 expressions), medium (~200), large (~2,000), and massive (20,000+) files. Track per-stage breakdown and warm-vs-cold latency. See §6.3.5.
- [x] **Dispatch loop optimization (5 commits, 9 changes)** — Reviewed and approved (see `plans/REVIEW_DISPATCH_LOOP_OPTIMIZATIONS.md`). Results: 67% reduction in `simple_add` (0.64 → 0.21 µs), 63% reduction in `variable_access` (0.60 → 0.22 µs). All 1,711 tests pass, 0 TS errors.
- [x] **Extract shared inline helpers for ADD/SUB/MUL** — Extracted `addNumbers()`, `subNumbers()`, `mulNumbers()` into `VMConversion.ts` (3-5 line helpers, V8/TurboFan inlines). Extracted `extractDurationMs()` in VM.ts (shared by ADD, SUB, DATE_ADD, DATE_SUB datetime fast paths). Commit `c4134e5`. All 1,966 tests pass, typecheck clean.
- [ ] **Split `initDispatchTable()`** — Currently ~380 lines (exceeds 50-line soft limit from CODING_STANDARDS.md). Accepted exception (data structure init, not branching logic), but could be split by opcode category (`initStackHandlers()`, `initArithmeticHandlers()`, `initConversionHandlers()`, etc.) for readability.

**Parse+Compile Optimization (5.5 — 46.7% of pipeline, deferred until after Lexer Rewrite):**
> ⏸️ **DEFERRED:** Lexer optimization (now §5.4) takes priority since it accounts for 46.1% of pipeline time and the Lexer rewrite will change all tokenization patterns the parser consumes. Parser optimization should happen AFTER the new lexer is stable.
>
> 📏 **Benchmark before & after every change:** Run the full pipeline throughput benchmark (4-run statistical analysis) *before* starting any optimization, apply the change incrementally, then re-run the same benchmark. Record the delta. Only proceed if the change shows a measurable improvement (≥3% pipeline speedup with CV < 8%). Each optimization below must include its before/after comparison in the checkbox description.

- [ ] **Direct-coded recursive descent parser** — Replace the current Pratt parselet pattern (table dispatch via token type ↔ parselet lookup) with a hand-rolled recursive descent parser. Pratt parsing adds ~2 function calls per token (getInfixParselet + pratt call), plus parselet object property lookups. A direct-coded parser uses switch/if chains with inline case handling:
  - Single switch on token type: NUMBER → parseNumber(), IDENTIFIER → parseIdentifier(), PLUS → parseBinaryOp(Precedence.SUM), etc.
  - Eliminates ALL parselet table lookups, virtual dispatch, and intermediate function calls
  - Estimated: **1.5-2.0× faster** than current Pratt implementation
- [ ] **Single-pass parse → compile** — Merge Parser.parseExpression() and BytecodeBuilder.build() into one pass. Currently parselets call builder.emitOpcode()/builder.emitNumber() during parsing, but the builder then does a separate build() pass to compact arrays into BytecodeProgram. Instead:
  - BytecodeBuilder pre-allocates fixed-size opcode/number TypedArrays (pooled, same strategy as 5.2h)
  - Parselets write directly into these arrays with a cursor
  - Build() becomes O(1) — just return { opcodes: subarray, numbers: subarray } view over the pool
  - Eliminates dynamic array growth, intermediate ArrayBuffer copies, and the compaction pass
  - Estimated: **1.3-1.5× faster** compile path, zero allocation for common expressions
- [ ] **Pre-computed token type dispatch** — The current Parser.char() returns a string; the Parser match/consume pattern does `tokens[pos].type` lookups with string comparisons. Replace with a flat integer-typed token array:
  - `tokenTypes: Uint8Array` — one byte per token, mapped through a `TokenTypeNames → enum` table loaded at expression start
  - Skip the `startsWith('MD_')`, `==='WS'` etc. string checks — just bitmask against `TokenFlags.Markdown | TokenFlags.Whitespace`
  - Estimated: **1.2-1.4× faster** parser dispatch
- [ ] **Inline common parselets** — Instead of calling separate parselet functions for every node type, inline the most common cases directly in the parse loop:
  - Number literals: inline `currentToken.value` → `emitNumber(parseFloat(value))` — ~3 ops
  - Binary operators: inline the precedence check + left/right recursion in the main loop instead of delegating to a separate parselet object. The infix parselet pattern costs ~6 function calls per binary op (getInfixParselet, led(), pratt for right side, loop check)
  - Parenthesized expressions: inline the open/close matching and nested parse call
  - Estimated: **1.4-1.8× faster** for expressions dominated by binary ops (~70% of real-world expressions)
- [ ] **Fixed-buffer bytecode emission** — Current BytecodeBuilder uses `push()` on growing arrays. Replace with:
  - `opcodes: Uint8Array` (pool of 512 bytes, tracked with `opWritePos`)
  - `numbers: Float64Array` (pool of 128 slots, tracked with `numWritePos`)
  - On overflow: fall back to dynamic array (rare — <5% of expressions exceed pool)
  - `build()` returns `new Uint8Array(pool.buffer, 0, opWritePos)` — zero-copy subarray view
  - Eliminates Array.push() amortized growth (O(log N) resizes), bounds checks on array accesses
  - Estimated: **1.2-1.3× faster** compile path
- [ ] **Operator fast paths — skip binaryOp type dispatch** — When both operands are known-Number at parse time (which is ~90%+ of real-world expressions), the parser can emit a specialized `ADD_NUM` / `SUB_NUM` / `MUL_NUM` / `DIV_NUM` opcode that skips ALL type dispatch in the VM:
  - VM switch: case ADD_NUM: pop two numbers, push number(a+b) — no Value.type checks, no binaryOp() call, no unifyUom(), no BigInt/Vector/String fallback
  - Redundant when combined with the existing binaryOp numeric fast path, but saves the `if (l.type === Number && r.type === Number)` guard check + the binaryOp function call overhead
  - Estimated: **1.1-1.2× additional VM speedup** for arithmetic-heavy expressions

**Benchmark results (end-to-end pipeline, 4-run statistical analysis):**
  - **Full pipeline throughput per expression:** 11.87 µs (95% CI: 10.32–13.42 µs, CV: 8.2%)
  - **Per-stage breakdown (CV 4.1–4.7%, highly stable):** Lex: 46.1% | Parse+Compile: 46.7% | Execute (VM): 7.2%
  - **Large-doc throughput:** ~240 lines/sec (consistent at scale — 10K and 50K lines within 1%)
  - **Warm speedup:** 9.35× (small docs, 100 lines) → 1.11× (massive docs, 50K lines) as bytecode cache hit rate decreases
  - **Dominant cost confirmed:** 92.8% of time is outside the VM — Lex + Parse+Compile are the next optimization frontier

**Complete Lexer Rewrite (5.4 — 46.1% of pipeline):**
> ▶ **NEXT UP — HIGHEST PRIORITY:** The moo-based lexer is the single largest bottleneck in the pipeline. This section is now §5.4 (promoted from §5.5) to reflect execution priority.
>
> 📏 **Benchmark before & after every phase:** Run the full pipeline throughput benchmark *before* Phase A starts. After each phase (A, B, C), re-run the same benchmark and record the delta. Phase D is the final validation gate — reject if pipeline total does not improve by ≥25%. Track per-stage breakdown (lex%/parse%/execute%) across all phases to detect regressions early.

- [x] **Design and implement the new lexer** — See dedicated §5.4 below for full specification ✅ DONE

> **IMPLEMENTED:** The custom lexer (`ExpressionLexer`) replaces moo entirely. See commits `073e9e4` through `9f0eec4` (lexer plugin system, V8-optimized expression-mode, markdown-mode scanners, contextual tokenization, position-based line classification).
>
> **Key outcomes:**
> - Monomorphic `Token` class with `typeId: number` for O(1) integer dispatch
> - `L0/L1/L2` tiered scanning: `classifyFromPositions()` replaces 3-pass regex system
> - `TokenClassRegistry` + `TokenLookup` for plugin-extensible keyword registration
> - `ParseletRegistry` dual-keyed (string + integer) for zero-parselet-change transition
> - `scanDocument()` unified document scan replacing `isEmptyLine()` + `findInlineSolvesInLine()`
> - Builder pool (4 `BytecodeBuilder` instances, round-robin) integrated into `ExpressionEngine`
> - All 1,966 tests pass, typecheck clean
>
> **Original motivation:** The moo-based lexer accounted for **46.1% of the full pipeline** (5.47 µs out of 11.87 µs total per expression). The existing fast numeric tokenizer (§1.3, `_tokenizeNumeric()`) proves the approach works — achieving **2.4-2.8× speedup** for numeric expressions by bypassing moo entirely. We should eliminate moo completely and replace it with a purpose-built state machine that is 10-100× faster for our specific token set.

**Why NOT moo:**
- moo is a general-purpose lexer supporting arbitrary regex patterns, multiple states, error recovery, etc. — all of which we never use
- moo compiles regex patterns at lexer construction time (tens of µs)
- moo calls `String.match()` per token — regex overhead dominates at our scale (see: `_tokenizeNumeric()` is 2.4× faster even with a trivial regex → moo overhead)
- moo allocates a new Token object per emitted token with dynamic property shapes — each token may have different fields set, breaking V8 hidden classes. Our custom lexer uses a monomorphic `Token` class with all 8 fields always set in constructor order, enabling V8's fastest inline cache path
- moo's markdown state machine is over-engineered for our needs (we only need to distinguish expression-lines from skip-lines)

#### 5.4.0 TokenClass API — Plugin-Extensible Keyword Registration

> ⚠️ **ARCHITECTURE NOTE (May 2026):** The implementation code examples in this section reflect the original draft architecture (CHAR_CLASS, ring buffer). The underlying Lexer implementation has been revised — see **§5.4.3** for the current V8-optimized design. The TokenClass API, TokenLookup, and PhraseMatcher interfaces documented here remain valid and unchanged.

**Problem:** The current moo lexer uses `ciKeywords()` and `phraseType()` closures that are rebuilt per-locale at `MarkdownLexer` construction time. These closures are opaque functions called once per IDENT token — ~2-3 µs overhead per expression for the function call + prototype chain lookup alone. The Lexer needs an **O(1) hash lookup** that is:

1. **Locale-aware** — Keywords change per language (`sqrt` vs `wurzel` vs `racine`)
2. **Provider-extensible** — Plugins can register new token types with their own keywords
3. **Mergeable** — Locale keywords + provider keywords + unit names merged into one lookup
4. **Phase-aware** — Multi-word phrases matched separately from single-word keywords

**Current Keyword Flow (moo):**

```
ILocale.keywordMap            knownUnits (Set)          moo regex rules
  (Record<string,string>)          │                      (TO_THE_POWER_OF, IDENT, etc.)
         │                         │                              │
         ▼                         ▼                              ▼
   ciKeywords() ──────────► (text) => {                  phraseType()
   wraps keywordMap           lowered = text.toLowerCase();  wraps phrase→type map
   + unit fallback            if (map[lowered]) return map[lowered];
   + "IDENT" default          if (knownUnits.has(text)) return "UNIT";
                              return "IDENT";
                            }
                                    │
                                    ▼
                              Token.type (string)
                                    │
                                    ▼
                           ParseletRegistry.getPrefix(token.type)
```

**Key insight:** The `ciKeywords` callback is called by moo for EVERY identifier token. In the Lexer, we eliminate this callback entirely and replace it with a single `Map.get()` call against a pre-built lookup table.

---

**TokenClass API Design:**

```typescript
/**
 * A TokenClass registers a set of keywords that the lexer maps to a specific
 * token type. Providers call `registry.register(tokenClass)` to teach the
 * lexer about their keywords. The registry merges locale keywords, provider
 * keywords, phrase mappings, and unit names into an optimized TokenLookup
 * structure consumed by the Lexer.
 */
interface TokenClass {
  /** The token type string produced by the lexer (e.g., "FUNC", "PI", "CARET").
   *  Must match a token type that a ParseletRegistry has a parselet for. */
  tokenType: string;

  /** Single-word keywords (case-insensitive). The lexer lowercases input
   *  before lookup, so these should be lowercase. Example:
   *  { sqrt: true, abs: true, sin: true, cos: true } for tokenType "FUNC" */
  keywords: Record<string, boolean>;

  /** Multi-word phrases (case-insensitive). Matched by a post-lexing
   *  PhraseMatcher that scans adjacent tokens. Example:
   *  { "to the power of": true, "power of": true } for tokenType "CARET" */
  phrases?: Record<string, boolean>;

  /** Priority for conflict resolution. When two TokenClasses register
   *  the same keyword, the higher-priority class wins. Locale keywords
   *  have priority 0. Providers should use priority >= 10 to override
   *  locale defaults. Default: 0 */
  priority?: number;

  /** Human-readable description for debugging and introspection */
  description?: string;
}
```

```typescript
/**
 * Central registry for keyword→token-type mappings. Providers register
 * TokenClasses; locales provide keyword maps; units provide a name set.
 * `build()` merges all sources into an optimized TokenLookup.
 */
class TokenClassRegistry {
  private classes: TokenClass[] = [];
  private localeKeywordMap: Record<string, string> | null = null;
  private localePhraseMap: Record<string, string> | null = null;
  private unitNames: Set<string> | null = null;

  /** Register a provider's TokenClass. Must be called BEFORE build(). */
  register(tokenClass: TokenClass): void {
    this.classes.push(tokenClass);
  }

  /** Unregister by tokenType. Useful for plugin unload. Requires rebuild. */
  unregister(tokenType: string): void {
    this.classes = this.classes.filter(c => c.tokenType !== tokenType);
  }

  /** Set the locale's keyword→type map. Called on locale change. */
  setLocale(keywordMap: Record<string, string>, phraseMap?: Record<string, string>): void {
    this.localeKeywordMap = keywordMap;
    this.localePhraseMap = phraseMap ?? null;
  }

  /** Set the unit name set. Called when unit list changes. */
  setUnits(unitNames: Set<string>): void {
    this.unitNames = unitNames;
  }

  /**
   * Build the optimized lookup structures.
   * Merge order (later overrides earlier):
   *   1. Locale keywords (priority 0)
   *   2. Provider keywords (sorted by priority, ascending)
   * Unit names are stored separately (checked AFTER keyword lookup fails).
   * Phrases are stored in a trie for O(phrase-length) matching.
   */
  build(): TokenLookup {
    const keywordToType = new Map<string, string>();

    // Layer 1: Locale keywords
    if (this.localeKeywordMap) {
      for (const [keyword, tokenType] of Object.entries(this.localeKeywordMap)) {
        keywordToType.set(keyword.toLowerCase(), tokenType);
      }
    }

    // Layer 2: Provider keywords (sorted by priority)
    const sorted = [...this.classes].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const tc of sorted) {
      for (const keyword of Object.keys(tc.keywords)) {
        keywordToType.set(keyword.toLowerCase(), tc.tokenType);
      }
    }

    // Build phrase trie from locale + providers
    const phraseTrie = this.buildPhraseTrie(sorted);

    return {
      keywordToType,
      phraseTrie,
      unitNames: this.unitNames ?? new Set(),
    };
  }

  private buildPhraseTrie(classes: TokenClass[]): PhraseNode {
    const root: PhraseNode = { children: new Map(), tokenType: null };

    // Layer 1: Locale phrases
    if (this.localePhraseMap) {
      for (const [phrase, tokenType] of Object.entries(this.localePhraseMap)) {
        this.insertPhrase(root, phrase.toLowerCase(), tokenType);
      }
    }

    // Layer 2: Provider phrases
    for (const tc of classes) {
      if (!tc.phrases) continue;
      for (const phrase of Object.keys(tc.phrases)) {
        this.insertPhrase(root, phrase.toLowerCase(), tc.tokenType);
      }
    }

    return root;
  }

  private insertPhrase(root: PhraseNode, phrase: string, tokenType: string): void {
    const words = phrase.split(' ');
    let node = root;
    for (const word of words) {
      if (!node.children.has(word)) {
        node.children.set(word, { children: new Map(), tokenType: null });
      }
      node = node.children.get(word)!;
    }
    node.tokenType = tokenType;
  }
}

/** Trie node for multi-word phrase matching */
interface PhraseNode {
  children: Map<string, PhraseNode>;
  tokenType: string | null;  // null = intermediate node, string = complete phrase
}

/**
 * The optimized lookup structure consumed by Lexer.
 * Built once by TokenClassRegistry.build(), reused for all lexer instances.
 */
interface TokenLookup {
  /** Lowercase keyword → token type. O(1) Map lookup. */
  keywordToType: Map<string, string>;

  /** Phrase trie for multi-word matching. Null if no phrases registered. */
  phraseTrie: PhraseNode | null;

  /** Case-sensitive unit names for UNIT fallback after keyword lookup fails. */
  unitNames: Set<string>;
}
```

---

**How the Lexer uses TokenLookup:**

```typescript
class Lexer {
  // Set at construction time, shared across all instances
  private static lookup: TokenLookup;

  static configure(lookup: TokenLookup): void {
    Lexer.lookup = lookup;
  }

  /**
   * Inline identifier tokenization — ~10-25 CPU instructions.
   * Called from the direct switch(charCode) dispatch (alpha/underscore branch).
   */
  private tokenizeIdentifier(start: number): Token {
    let end = start;
    let cc = this.input.charCodeAt(end);

    // Read alphanumeric span: [a-zA-Z_][a-zA-Z0-9_]*
    while (
      end < this.input.length &&
      ((cc >= 48 && cc <= 57) ||   // 0-9
       (cc >= 65 && cc <= 90) ||   // A-Z
       (cc >= 97 && cc <= 122) ||  // a-z
       cc === 95)                  // _
    ) {
      end++;
      cc = this.input.charCodeAt(end);
    }

    const text = this.input.slice(start, end);

    // O(1) hash lookup — replaces ciKeywords() function call
    const lower = text.toLowerCase();
    let type = Lexer.lookup.keywordToType.get(lower);

    if (!type) {
      // Fallback: check unit names (case-sensitive!)
      type = Lexer.lookup.unitNames.has(text) ? 'UNIT' : 'IDENT';
    }

    this.pos = end;
    return this.emitToken(type, text);
  }

  /**
   * PhraseMatcher — post-lexing pass that merges adjacent IDENT tokens
   * into phrase tokens. Runs in O(tokens × maxPhraseWords) time.
   * Typical overhead: < 50ns per token (max phrase length = 4 words).
   */
  static matchPhrases(tokens: Token[], lookup: TokenLookup): Token[] {
    if (!lookup.phraseTrie || tokens.length === 0) return tokens;

    const result: Token[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // Only try phrase matching on IDENT tokens
      if (token.type === 'IDENT' || token.type === 'WS') {
        // Try to match a phrase starting at position i
        const matched = Lexer.tryMatchPhrase(tokens, i, lookup.phraseTrie);
        if (matched) {
          // Replace matched tokens with a single phrase token
          result.push(matched.phraseToken);
          i = matched.nextIndex;
          continue;
        }
      }

      result.push(token);
      i++;
    }

    return result;
  }

  private static tryMatchPhrase(
    tokens: Token[], start: number, trie: PhraseNode
  ): { phraseToken: Token; nextIndex: number } | null {
    let node = trie;
    let i = start;
    let bestMatch: { tokenType: string; endIndex: number } | null = null;

    while (i < tokens.length) {
      const token = tokens[i];

      // Skip whitespace between phrase words
      if (token.type === 'WS') {
        i++;
        continue;
      }

      // Match this word against trie
      const word = token.value.toLowerCase();
      const child = node.children.get(word);
      if (!child) break;

      node = child;
      i++;

      // If this node completes a phrase, record it (greedy: longest match wins)
      if (node.tokenType) {
        bestMatch = { tokenType: node.tokenType, endIndex: i };
      }
    }

    if (!bestMatch) return null;

    // Build a merged phrase token
    const firstToken = tokens[start];
    const lastToken = tokens[bestMatch.endIndex - 1];
    const phraseText = tokens
      .slice(start, bestMatch.endIndex)
      .map(t => t.value)
      .join('');

    return {
      phraseToken: {
        type: bestMatch.tokenType,
        value: phraseText,
        text: phraseText,
        offset: firstToken.offset,
        lineBreaks: 0,
        line: firstToken.line,
        col: firstToken.col,
      },
      nextIndex: bestMatch.endIndex,
    };
  }
}
```

---

**Provider Registration Pattern:**

Each provider gains a parallel `registerXxxTokens()` function alongside its existing `registerXxxParselets()`:

```typescript
// src/solve-js/src/providers/arithmetic/tokens.ts (NEW)
import { TokenClassRegistry } from '@solve-js/lexer/TokenClassRegistry';

export function registerArithmeticTokens(registry: TokenClassRegistry): void {
  // Constants that need specific token types (not IDENT)
  registry.register({
    tokenType: 'PI',
    keywords: { pi: true },
    description: 'Mathematical constant π (3.14159...)',
  });

  registry.register({
    tokenType: 'E',
    keywords: { e: true },
    description: "Euler's number (2.71828...)",
  });

  // Multi-word phrase operators
  // NOTE: phrases are locale-dependent! English phrases registered here.
  // Locale system can override these via ILocale.phraseMap.
  registry.register({
    tokenType: 'CARET',
    keywords: {},
    phrases: {
      'to the power of': true,
      'power of': true,
    },
    priority: 10,  // Override locale if both register the same phrase
    description: 'Exponentiation operators (x^y)',
  });

  registry.register({
    tokenType: 'TIMES_BY',
    keywords: {},
    phrases: { 'times by': true },
    priority: 10,
    description: 'Multiplication phrase operator',
  });

  registry.register({
    tokenType: 'MULTIPLY_BY',
    keywords: {},
    phrases: { 'multiply by': true },
    priority: 10,
    description: 'Multiplication phrase operator',
  });

  registry.register({
    tokenType: 'DIVIDE_BY',
    keywords: {},
    phrases: { 'divide by': true },
    priority: 10,
    description: 'Division phrase operator',
  });

  registry.register({
    tokenType: 'INCREASE_BY',
    keywords: {},
    phrases: { 'increase by': true },
    priority: 10,
    description: 'Increase-by phrase operator',
  });

  registry.register({
    tokenType: 'DECREASE_BY',
    keywords: {},
    phrases: { 'decrease by': true },
    priority: 10,
    description: 'Decrease-by phrase operator',
  });
}
```

```typescript
// src/solve-js/src/providers/function/tokens.ts (NEW)
import { TokenClassRegistry } from '@solve-js/lexer/TokenClassRegistry';

export function registerFunctionTokens(registry: TokenClassRegistry): void {
  // Function names are locale-dependent, so this registers the English defaults.
  // The locale keywordMap already handles this via the locale system.
  // This function exists as an escape hatch for custom providers that add new
  // function keywords NOT in the standard locale keywordMaps.
  registry.register({
    tokenType: 'FUNC',
    keywords: {
      sqrt: true, abs: true, sin: true, cos: true, tan: true,
      log: true, ceil: true, floor: true, round: true,
      min: true, max: true, asin: true, acos: true, atan: true,
      atan2: true, sinh: true, cosh: true, tanh: true,
      asinh: true, acosh: true, atanh: true, cbrt: true,
      clz32: true, expm1: true, exp: true, fround: true,
      hypot: true, imul: true, log10: true, log1p: true,
      log2: true, pow: true, random: true, sign: true, trunc: true,
      degtorad: true, radtodeg: true,
    },
    priority: 5,  // Higher than locale (0), lower than custom plugins (10+)
    description: 'Math function keywords',
  });
}
```

---

**Locale Phrase Map (new `ILocale` field):**

```typescript
// src/solve-js/src/constants/locales/en.ts
export interface ILocale {
  code: string;
  label: string;
  keywordMap: Record<string, string>;
  phraseMap?: Record<string, string>;   // ← NEW: multi-word phrase → token type
  display: { /* ... unchanged */ };
}

export const enLocale: ILocale = {
  code: 'en',
  label: 'English',
  keywordMap: {
    pi: 'PI', e: 'E',
    plus: 'PLUS', add: 'PLUS', and: 'PLUS',
    // ... (unchanged)
  },
  phraseMap: {                          // ← NEW
    'to the power of': 'CARET',
    'power of': 'CARET',
    'times by': 'TIMES_BY',
    'multiply by': 'MULTIPLY_BY',
    'divide by': 'DIVIDE_BY',
    'increase by': 'INCREASE_BY',
    'decrease by': 'DECREASE_BY',
  },
  display: { /* unchanged */ },
};
```

```typescript
// src/solve-js/src/constants/locales/de.ts
export const deLocale: ILocale = {
  code: 'de',
  label: 'Deutsch',
  keywordMap: {
    pi: 'PI', e: 'E',
    plus: 'PLUS', add: 'PLUS', und: 'PLUS',
    minus: 'MINUS', subtrahieren: 'MINUS', entfernen: 'MINUS', nehmen: 'MINUS',
    mal: 'STAR', multiplizieren: 'STAR',
    teilen: 'SLASH',
    // ... (unchanged)
  },
  phraseMap: {                          // ← NEW  (German phrases)
    'zur potenz von': 'CARET',
    'potenz von': 'CARET',
    'mal mit': 'TIMES_BY',
    'multiplizieren mit': 'MULTIPLY_BY',
    'teilen durch': 'DIVIDE_BY',
    'erhöhen um': 'INCREASE_BY',
    'verringern um': 'DECREASE_BY',
  },
  display: { /* unchanged */ },
};
```

---

**Registration Bootstrap (token registration entry point):**

```typescript
// src/solve-js/src/lexer/tokenRegistration.ts (NEW)
import { TokenClassRegistry } from './TokenClassRegistry';
import { knownUnits } from './units';
import { getLocale } from '@solve-js/constants/locales';

// Provider token registration imports
import { registerArithmeticTokens } from '@solve-js/providers/arithmetic/tokens';
import { registerDatetimeTokens } from '@solve-js/providers/datetime/tokens';
import { registerFunctionTokens } from '@solve-js/providers/function/tokens';
import { registerUomTokens } from '@solve-js/providers/uom/tokens';
import { registerPercentageTokens } from '@solve-js/providers/percentage/tokens';
import { registerDiceTokens } from '@solve-js/providers/dice/tokens';
import { registerVectorTokens } from '@solve-js/providers/vector/tokens';
import { registerBigIntTokens } from '@solve-js/providers/biginteger/tokens';
import { registerVariableTokens } from '@solve-js/providers/variables/tokens';

/**
 * Build the TokenLookup for Lexer. Called once at startup and on locale change.
 * This replaces the moo-level ciKeywords() and phraseType() closures.
 */
export function buildTokenLookup(localeCode: string = 'en'): TokenLookup {
  const registry = new TokenClassRegistry();

  // Layer 1: Locale keywords + phrases
  const locale = getLocale(localeCode);
  registry.setLocale(locale.keywordMap, locale.phraseMap);

  // Layer 2: Unit names
  registry.setUnits(knownUnits);

  // Layer 3: Provider keywords (override locale where needed)
  registerArithmeticTokens(registry);
  registerDatetimeTokens(registry);
  registerFunctionTokens(registry);
  registerUomTokens(registry);
  registerPercentageTokens(registry);
  registerDiceTokens(registry);
  registerVectorTokens(registry);
  registerBigIntTokens(registry);
  registerVariableTokens(registry);

  return registry.build();
}
```

---

**Migration Path (producing identical Token output):**

The Lexer must produce the **exact same Token stream** as the current moo lexer. The `TokenClass API` guarantees this because:

1. **Operator tokens** (PLUS, MINUS, STAR, LPAREN, etc.) — Same 1-2 character rules, same token type strings
2. **Number tokens** — Same parsing logic (digits + optional dot + optional exponent), now universally applied
3. **Identifier tokens** — Same keyword lookup logic via `TokenLookup.keywordToType` (replaces `ciKeywords` callback)
4. **UNIT fallback** — Same case-sensitive `knownUnits.has(text)` check
5. **IDENT fallback** — Same default when no keyword matches
6. **Multi-word phrases** — Same phrase list, matched via `PhraseMatcher` integrated into `tokenizeAll()` instead of regex
7. **Whitespace/Newline tokens** — Same emission pattern
8. **Error tokens** — Same behavior on unrecognized input

**Validation strategy:** Run ALL existing lexer benchmarks and tests against both lexers. The Lexer must:
- Produce identical token sequences for all 13 existing lexer test inputs
- Pass all 82 VM opcode tests (which depend on correct tokenization)
- Pass all 1,711 existing tests
- Show measurable speed improvements in the lexer benchmarks

---

#### 5.4.1 Lexer↔Parser Integration — Optimized Token Dispatch

> ⚠️ **ARCHITECTURE NOTE (May 2026):** The code examples in this section reflect the original ring-buffer-based Lexer. See **§5.4.3** for the revised architecture (monomorphic Token class, direct switch dispatch, c0 cached character pattern). The integer `typeId` system, `ParseletRegistry` dual-keyed maps, and Parser `consume()`/`match()` integer comparison documented here remain valid.

**Problem:** After the Lexer produces tokens, the Parser spends **46.7% of pipeline time** (6.26 µs) consuming them. The current interface has three hot-path costs:

1. **`Map<string, Parselet>.get()`** — Every `parseletRegistry.getPrefix(token.type)` hashes a string. With ~45 token types, the hash is computed on every dispatch — ~0.3 µs per expression for 10-15 dispatches.
2. **`consume("RPAREN")` string comparison** — 38 calls across parselets do `token.type !== expectedType` string comparisons. Each is a character-by-character equality check — ~0.2 µs total.
3. **Token object allocation** — Every token is `{ type, value, text, offset, lineBreaks, line, col }` — 7 fields allocated per token. For an average ~15-token expression, that's 15 heap allocations — ~0.5 µs.

The Lexer design already solves #3 (monomorphic Token allocation via V8 nursery GC — see §5.4.3 architecture). For #1 and #2, we introduce **integer token type IDs** — a zero-parselet-change optimization that converts string comparisons to integer comparisons behind the Parser API.

---

**Token Type ID System:**

The existing `TokenTypes` constant in `src/solve-js/src/lexer/Token.ts` already defines ~60 string constants (e.g., `NUMBER: "NUMBER"`, `PLUS: "PLUS"`). We extend this with an integer ID registry:

```typescript
// src/solve-js/src/lexer/Token.ts (additions)

/** Auto-incrementing integer ID for each token type. */
let _nextTokenTypeId = 0;

/** String → integer ID lookup. Populated eagerly at module load. */
const _tokenTypeNameToId = new Map<string, number>();

/** Integer ID → string lookup. For debug/error messages. */
const _tokenTypeIdToName = new Map<number, string>();

/** Register a token type name and get back its integer ID.
 *  Idempotent — returns existing ID if already registered. */
export function registerTokenType(name: string): number {
  const existing = _tokenTypeNameToId.get(name);
  if (existing !== undefined) return existing;
  const id = _nextTokenTypeId++;
  _tokenTypeNameToId.set(name, id);
  _tokenTypeIdToName.set(id, name);
  return id;
}

/** Get the integer ID for a token type name. Throws if not registered. */
export function tokenTypeId(name: string): number {
  const id = _tokenTypeNameToId.get(name);
  if (id === undefined) throw new Error(`Unregistered token type: "${name}"`);
  return id;
}

/** Get the name for a token type ID (for error messages). */
export function tokenTypeName(id: number): string {
  return _tokenTypeIdToName.get(id) ?? `UNKNOWN_${id}`;
}
```

All known token types are registered eagerly at module load via a bootstrap call:

```typescript
// Called once during Lexer initialization
function registerAllTokenTypes(): void {
  for (const name of Object.values(TokenTypes)) {
    registerTokenType(name);
  }
  // Plugin-registered token types are registered via TokenClassRegistry.register()
}
```

---

**Token Interface Extension:**

The `Token` interface gains a single field:

```typescript
export interface Token {
  type: string;     // unchanged — string for backwards compat
  typeId: number;   // NEW — integer for fast comparison
  value: string;
  text: string;
  offset: number;
  lineBreaks: number;
  line: number;
  col: number;
}
```

**Backwards compatibility:** All existing parselets continue using `token.type` (string). The `typeId` field is populated by the Lexer but never referenced by parselets. The transition is invisible to 15+ parselet files.

---

**Lexer `emitToken()` — Setting Both Fields:**

```typescript
class Lexer {
  /** Pre-computed token type IDs for the char→operator mapping. Built once. */
  private static readonly OP_TYPE_IDS: Record<string, number> = {
    '+': tokenTypeId('PLUS'),     '-': tokenTypeId('MINUS'),
    '*': tokenTypeId('STAR'),     '/': tokenTypeId('SLASH'),
    '^': tokenTypeId('CARET'),    '%': tokenTypeId('PERCENT'),
    '(': tokenTypeId('LPAREN'),   ')': tokenTypeId('RPAREN'),
    ',': tokenTypeId('COMMA'),     '=': tokenTypeId('EQUALS'),
    ':': tokenTypeId('COLON'),
  };

  private emitToken(type: string, value: string): Token {
    const token = this.tokens[this.writePos++ % 256];
    token.type = type;
    token.typeId = tokenTypeId(type);  // O(1) Map.get — pre-populated
    token.value = value;
    token.text = value;
    // ... offset, line, col tracking ...
    return token;
  }
}
```

For the hot path (operator tokens), the `tokenTypeId()` call is cached in `OP_TYPE_IDS` so it's a direct property lookup, not a Map.get. For identifier tokens (which go through `TokenLookup.keywordToType`), the returned string is immediately converted to an ID — one extra Map.get per token.

---

**ParseletRegistry — Dual-Keyed Maps (Zero API Change):**

The `ParseletRegistry` internally maintains integer-keyed maps alongside its existing string-keyed maps. The public API is unchanged — providers still call `registerPrefix("NUMBER", ...)` with strings. Internally, the registry populates both maps:

```typescript
export class ParseletRegistry {
  // Existing string-keyed maps (kept for diagnostics + backwards compat)
  private prefixParselets: Map<string, PrefixParselet> = new Map();
  private infixParselets: Map<string, InfixParselet> = new Map();

  // NEW: integer-keyed maps for parser hot path
  private prefixById: Map<number, PrefixParselet> = new Map();
  private infixById: Map<number, InfixParselet> = new Map();

  registerPrefix(tokenType: string, parselet: PrefixParselet): void {
    this.prefixParselets.set(tokenType, parselet);
    this.prefixById.set(tokenTypeId(tokenType), parselet);  // ← NEW
  }

  registerInfix(tokenType: string, parselet: InfixParselet): void {
    this.infixParselets.set(tokenType, parselet);
    this.infixById.set(tokenTypeId(tokenType), parselet);   // ← NEW
  }

  // Public API unchanged — accepts strings (for parselets, diagnostics)
  getPrefix(tokenType: string | number): PrefixParselet | undefined {
    if (typeof tokenType === 'number') return this.prefixById.get(tokenType);
    return this.prefixParselets.get(tokenType);
  }

  getInfix(tokenType: string | number): InfixParselet | undefined {
    if (typeof tokenType === 'number') return this.infixById.get(tokenType);
    return this.infixParselets.get(tokenType);
  }

  // ... clear() clears both maps ...
}
```

**Performance:** The integer `Map.get()` call avoids string hashing — saving ~2-5ns per dispatch. With ~10-15 dispatches per expression, that's ~20-75ns saved. Small per dispatch, but compounds across the full pipeline.

---

**Parser Hot Path — Integer Dispatch:**

The Parser's `parseExpression()` is modified to use `token.typeId` for ParseletRegistry lookups:

```typescript
// Parser.parseExpression() — modified dispatch lines only

parseExpression(bindingPower = 0, builder?: BytecodeBuilder): void {
  // ... depth check unchanged ...
  const token = this.consume();
  // ... null check unchanged ...

  // OLD: const prefixParselet = this.parseletRegistry.getPrefix(token.type);
  // NEW: integer-keyed lookup — no string hashing
  const prefixParselet = this.parseletRegistry.getPrefix(token.typeId);

  // ... rest unchanged ...

  while (this.current < this.tokens.length) {
    const nextToken = this.peek();
    if (!nextToken) break;

    // OLD: const infixParselet = this.parseletRegistry.getInfix(nextToken.type);
    // NEW: integer-keyed lookup
    const infixParselet = this.parseletRegistry.getInfix(nextToken.typeId);

    // ... rest unchanged ...
  }
}
```

**Key insight:** Parselets receive `Token` objects and access `.type` (string) and `.value` (string) — both unchanged. The `typeId` field is an implementation detail of the Parser's hot path. Parselets never see it.

---

**`consume()` / `match()` — Integer Comparison, String Fallback:**

The Parser's `consume()` and `match()` methods accept strings from parselets but compare integer IDs internally:

```typescript
consume(expectedType?: string): Token {
  const token = this.tokens[this.current];
  if (!token) {
    throw ErrorFactory.parsing("UNEXPECTED_END_OF_INPUT", "Unexpected end of input");
  }

  if (expectedType !== undefined) {
    // Fast path: integer comparison (hot)
    const expectedId = tokenTypeId(expectedType);  // Map.get — but cached by V8 IC
    if (token.typeId !== expectedId) {
      // Slow path: string comparison for error message detail
      throw ErrorFactory.parsing(
        "UNEXPECTED_TOKEN_TYPE",
        `Expected token type "${expectedType}" but got "${token.type}" ("${token.value}")`,
        { expectedType, actualType: token.type, actualValue: token.value }
      );
    }
  }

  this.current++;
  return token;
}

match(expectedType: string): boolean {
  const token = this.peek();
  if (token && token.typeId === tokenTypeId(expectedType)) {
    this.advance();
    return true;
  }
  return false;
}
```

**Performance:** `tokenTypeId()` is `Map.get()` which V8's inline cache (IC) monomorphizes after the first few calls. For `consume("RPAREN")` — called ~5-10 times per expression — the IC stabilizes and the lookup becomes a single load. The integer comparison `token.typeId !== expectedId` is 1 CPU instruction vs ~4-8 for string comparison.

**Caveat:** We could optimize further by pre-computing expected IDs in each parselet (e.g., `private static RPAREN_ID = tokenTypeId('RPAREN')`), but this would require changing all 15+ parselet files. The `tokenTypeId()` call is fast enough that parselet-level caching is not worth the maintenance cost.

---

**Token Array Flow — Monomorphic Token → Parser.load():**

The Lexer's `tokenizeAll()` method produces a `Token[]` using monomorphic Token allocation:

```typescript
class Lexer {
  /**
   * Tokenize the entire input into a Token array.
   * Uses monomorphic Token allocation directly; no intermediate buffer.
   * Runs PhraseMatcher inline before returning.
   */
  tokenizeAll(input: string): Token[] {
    this.reset(input, 'expression');
    this.pos = 0;

    const result: Token[] = [];

    // Tokenize into monomorphically-allocated Token objects
    while (this.pos < this.input.length) {
      const token = this.next();  // allocates Token via `new Token()` — V8 nursery GC
      if (token) result.push(token);
    }

    // Run phrase matching inline (was a separate post-lexing pass)
    if (Lexer.lookup.phraseTrie) {
      return Lexer.matchPhrases(result, Lexer.lookup);
    }

    return result;
  }
}
```

**Then in ExpressionEngine.evaluateLine():**
```typescript
const tokens = fastLexer.tokenizeAll(expression);  // Lexer produces Token[]
parser.load(tokens);                                 // Parser.balanceParens() + reset
const builder = this.builderPool.get();
builder.reset();
parser.parseExpression(0, builder);                  // Parser dispatches via typeId
const bytecode = builder.buildInto(this.bufferPool.get());
```

**Allocation profile:** Each token is allocated as `new Token(...)` — a monomorphic class with 7 fields always set in the same order (stable hidden class). V8's Scavenger GC allocates nursery objects via bump pointers in ~1ns. For a typical 15-token expression, this is 15 nursery allocations (vs ~30-50 with moo's per-token String.match() allocations). The ring buffer approach (§5.4 original draft) was abandoned — V8's nursery GC is actually faster than managing a pre-allocated buffer, and the copy-out step (`result.push({...this.tokens[i]})`) negated any zero-allocation benefit.

**Future optimization (deferred to §5.5):** If we eliminate the token array entirely (single-pass lex→parse→compile), the `result.push({...})` goes away. This is the ultimate goal but requires merging the Parser and Lexer into one pass.

---

**PhraseMatcher — Integrated into tokenizeAll():**

The PhraseMatcher is called **inside** `tokenizeAll()`, not as a separate pass. This ensures:
1. Phrases are always matched — no caller forgets to call `matchPhrases()`
2. The PhraseMatcher produces tokens with correct `typeId` fields (it calls `tokenTypeId()` internally)
3. The Parser never sees raw IDENT tokens that should be merged into phrases

**Updated `matchPhrases` — sets `typeId`:**
```typescript
private static matchPhrases(tokens: Token[], lookup: TokenLookup): Token[] {
  if (!lookup.phraseTrie || tokens.length === 0) return tokens;
  // ... same trie matching logic as §5.4.0 ...
  // When building the merged phrase token:
  return {
    phraseToken: {
      type: bestMatch.tokenType,
      typeId: tokenTypeId(bestMatch.tokenType),  // ← NEW: set integer ID
      value: phraseText,
      text: phraseText,
      offset: firstToken.offset,
      lineBreaks: 0,
      line: firstToken.line,
      col: firstToken.col,
    },
    nextIndex: bestMatch.endIndex,
  };
}
```

**Phrase dispatch fix:** Only IDENT tokens trigger phrase matching (removed the `|| token.type === 'WS'` from the dispatch condition — WS is skipped inside `tryMatchPhrase`, not at the call site). Additionally, phrase-start words that match single-word keywords (e.g., `"to"` → some keyword) are now checked: if the word is in `lookup.phraseStartWords` (a `Set<string>` of first words of all phrases, built during `TokenClassRegistry.build()`), it is emitted as `"IDENT"` regardless of keyword priority. This prevents plugins from accidentally breaking phrases.

```typescript
// In TokenClassRegistry.build():
const phraseStartWords = new Set<string>();
for (const phrase of Object.keys(allPhrases)) {
  phraseStartWords.add(phrase.split(' ')[0]);
}

return {
  keywordToType,
  phraseTrie,
  phraseStartWords,  // ← NEW
  unitNames: this.unitNames ?? new Set(),
};

// In Lexer.tokenizeIdentifier():
const lower = text.toLowerCase();

// If this word starts a phrase, always emit IDENT (defer to PhraseMatcher)
if (Lexer.lookup.phraseStartWords.has(lower)) {
  return this.emitToken('IDENT', text);
}

// Normal keyword lookup
let type = Lexer.lookup.keywordToType.get(lower);
if (!type) {
  type = Lexer.lookup.unitNames.has(text) ? 'UNIT' : 'IDENT';
}
return this.emitToken(type, text);
```

---

**`balanceParens()` — Updated for typeId:**

The Parser's `balanceParens()` method constructs synthetic tokens for missing parens. These synthetic tokens must include `typeId`:

```typescript
private balanceParens(tokens: Token[]): Token[] {
  // ... count logic unchanged ...
  // When appending missing closing parens:
  result.push({
    type: "RPAREN",
    typeId: tokenTypeId("RPAREN"),  // ← NEW
    value: ")",
    text: ")",
    offset: lastToken ? lastToken.offset + lastToken.text.length : 0,
    lineBreaks: 0,
    line: lastToken ? lastToken.line : 1,
    col: lastToken ? lastToken.col + lastToken.text.length : 1,
  } as Token);
}
```

---

**Performance Estimates (per expression, based on 13.04 µs baseline):**

| Optimization | Savings | Notes |
|-------------|:-------:|-------|
| Integer-keyed ParseletRegistry lookup | **~0.2 µs** | Eliminates string hashing in ~10-15 `Map.get()` calls |
| Integer comparison in `consume()`/`match()` | **~0.15 µs** | Replaces ~8-12 string comparisons with integer comparisons |
| Monomorphic Token allocation (already in Lexer) | **~0.5 µs** | Eliminates ~15 heap allocations per expression (vs moo); V8 nursery GC handles in ~1ns each |
| PhraseMatcher integrated into tokenizeAll() | **~0.1 µs** | Eliminates separate pass; overhead ~20-40ns for non-phrase expressions |
| **Total parser interface savings** | **~0.95 µs** | Reduces Parse+Compile from 6.26 → ~5.3 µs (15% faster) |

**Combined with Lexer savings (5.89 → ~0.8 µs):**
- Lex: ~0.8 µs (was 5.89)
- Parse+Compile: ~5.3 µs (was 6.26)
- VM: ~0.89 µs (unchanged)
- **Total pipeline: ~7.0 µs** (was 13.04 µs) — **46% faster**

---

**What NOT to Optimize (Now):**

| Change | Why not now |
|--------|------------|
| Single-pass lex→parse→compile | Major architectural change — deferred to §5.5 after lexer is stable |
| Change parselets to use integer IDs | 15+ files, 500+ lines to change — zero performance benefit (only slow path) |
| Uint8Array token type stream | Requires changing Parser from Token[] to parallel arrays — breaks diagnostic pipeline, error messages, and `token.value` access in all parselets |
| Inline parselet dispatch (switch on tokenType) | Eliminates plugin extensibility — `ParseletRegistry` is needed for custom providers |
| Pre-compute typeIds in parselets (`static RPAREN_ID`) | Adds maintenance burden to every parselet; `tokenTypeId()` call is IC-monomorphized after first use |

---

**Files to Modify (Phase A):**

| File | Change | Lines |
|------|--------|:-----:|
| `src/solve-js/src/lexer/Token.ts` | Add `typeId: number` field, `registerTokenType()`, `tokenTypeId()`, `tokenTypeName()` | +30 |
| `src/solve-js/src/lexer/TokenClassRegistry.ts` | Add `phraseStartWords` to `TokenLookup`, build during `build()` | +5 |
| `src/solve-js/src/lexer/Lexer.ts` | Set `typeId` in `emitToken()`, check `phraseStartWords` in `tokenizeIdentifier()`, integrate PhraseMatcher into `tokenizeAll()` | +15 |
| `src/solve-js/src/parser/registry/ParseletRegistry.ts` | Add `prefixById`/`infixById` maps, update `register*`/`get*`/`clear()` | +15 |
| `src/solve-js/src/parser/Parser.ts` | Use `token.typeId` for dispatch, update `consume()`/`match()`/`balanceParens()` | +10 |
| **Total** | | **~75 lines** |

**Zero parselet files changed.** The entire optimization is behind the Parser/Registry API.

---

#### 5.4.2 Levels-of-Detail Lexer — Tiered Scanning for Markdown Documents

**Problem:** The current system has **three disconnected passes** for determining which document lines contain expressions:

| Pass | Location | Mechanism | Cost (100-line doc) |
|------|----------|-----------|:-------------------:|
| `isEmptyLine()` | `ExpressionEngineSafety.ts` | 7 regex patterns | ~15 µs |
| `findInlineSolvesInLine()` | `ExpressionEngineSafety.ts` | 1 regex (`/s\`([^\`]*)\`/g`) | ~8 µs |
| `MarkdownLexer.reset()` | `MarkdownLexer.ts` | moo state machine (40+ regex rules) | ~50 µs |
| **Total** | | | **~73 µs** |

All three passes scan the same document text independently. The Lexer can unify them into a **single character-scanning pass** with three levels of detail:

```
┌─────────────────────────────────────────────────────────────┐
│                      DOCUMENT TEXT                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
     ┌──────────────────────────────────────────┐
     │  L0 — MACRO SKIP                         │
     │  ~5-10 CPU instructions per line start   │
     │  First-char dispatch: # > ` $ | - * [    │
     │  Skips entire line when safe             │
     │  ~50ns per line (for skip lines)         │
     └──────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         [SKIP LINE]              [POTENTIAL EXPRESSION]
              │                           │
              ▼                           ▼
     ┌──────────────────────────────────────────┐
     │  L1 — EXPRESSION GATING                  │
     │  ~50-100 CPU instructions per line       │
     │  Scan for: digits, operators, s`,        │
     │            phrase-start words, letters   │
     │  ~100-200ns per line (for gated lines)   │
     └──────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         [NO EXPRESSION]            [HAS EXPRESSION]
              │                           │
              ▼                           ▼
     ┌──────────────────────────────────────────┐
     │  L2 — FULL TOKENIZATION                  │
     │  Character-by-character state machine    │
     │  Identifier → TokenLookup keyword lookup  │
     │  Operator → OP_TYPE_IDS dispatch          │
     │  Phrase matching (inline)                │
     │  ~0.15-0.8 µs per expression             │
     └──────────────────────────────────────────┘
```

---

**L0 — Macro Skip (first-character dispatch):**

The L0 scanner reads the **first non-whitespace character** of a line and dispatches immediately:

```typescript
class Lexer {
  /**
   * L0: Classify a line by its first significant character.
   * Returns 'skip' (pure markdown, no expression possible),
   * 'potential' (might contain expression), or 'expression' (definitely has one).
   *
   * ~5-10 CPU instructions. No function calls. No regex.
   */
  private static classifyLineFirstChar(firstChar: number): 'skip' | 'potential' | 'expression' {
    // Digits 0-9 → always an expression (number literal)
    if (firstChar >= 48 && firstChar <= 57) return 'expression';  // 0-9

    // Operators → always an expression
    // + - * / ^ % ( ) , = :
    if (
      firstChar === 43 ||  // +
      firstChar === 45 ||  // -
      firstChar === 42 ||  // *
      firstChar === 47 ||  // /
      firstChar === 94 ||  // ^
      firstChar === 37 ||  // %
      firstChar === 40 ||  // (
      firstChar === 41 ||  // )
      firstChar === 44 ||  // ,
      firstChar === 61 ||  // =
      firstChar === 58     // :
    ) return 'expression';

    // s` → inline solve marker (s = 115, ` = 96)
    // Check first char = 's' (115) and second char = '`' (96)
    // Handled at L1 level — L0 just says 'potential'

    // Markdown structural characters → skip entire line
    // # (35) = header, > (62) = blockquote, ` (96) = code fence,
    // $ (36) = math, | (124) = table, ! (33) = embed
    if (
      firstChar === 35 ||  // # header
      firstChar === 62 ||  // > blockquote
      firstChar === 96 ||  // ` code fence
      firstChar === 36 ||  // $ math
      firstChar === 124    // | table
    ) return 'skip';

    // [ (91) = wikilink or ! (33) = embed (but ! was caught above as embed)
    if (firstChar === 91) return 'skip';  // [ wikilink

    // - (45) = list or horizontal rule → potential (could be "-5" negative number!)
    // * (42) = list or multiplication → potential (could be "* 5")
    // Both return 'potential' because they could be expressions starting with
    // unary minus or bullet-marker-with-expression

    // Letters (A-Z, a-z) and underscore → potential (identifier/keyword/phrase)
    if (
      (firstChar >= 65 && firstChar <= 90) ||   // A-Z
      (firstChar >= 97 && firstChar <= 122) ||  // a-z
      firstChar === 95                           // _
    ) return 'potential';

    // Anything else → potential (Unicode, emoji, unknown)
    return 'potential';
  }
}
```

**L0 decisions explained:**

| First char | L0 verdict | Rationale |
|-----------|:----------:|-----------|
| `0-9` | `expression` | Number literal — can't be markdown |
| `+`, `-`, `*`, `/`, `^`, `%`, `(`, `)`, `,`, `=`, `:` | `expression` | Operator — can't be markdown (except `-` and `*` which need L1) |
| `#` | `skip` | Header — never an expression |
| `>` | `skip` | Blockquote — expression after `>` is extremely rare |
| `` ` `` | `skip` | Code fence — enter code-block state |
| `$` | `skip` | Math block — enter math-block state |
| `\|` | `skip` | Table row — rare to have expressions in tables |
| `[` | `skip` | Wikilink — skip to `]]` |
| `!` | `skip` | Embed (`![[...]]`) — skip to `]]` |
| `-` | `potential` | Could be list marker OR negative number (`-5`) OR unary minus (`-x`) |
| `*` | `potential` | Could be list marker OR multiplication OR bold marker |
| `a-z`, `A-Z`, `_` | `potential` | Identifier — could be keyword (`pi`), variable (`total`), function (`sqrt`), or phrase-start (`to the power of`) |
| Other (Unicode) | `potential` | Conservative — treat as possible expression |

**L0 corner case — blockquote with inline solve:**

A line like `> s\`1 + 2\`` is technically a blockquote containing an inline solve. L0 classifies `>` as `skip`, which would miss this. **Fix:** After L0 `skip` on `>`, do a fast scan for `s\`` (indexOf, O(n) but rare — blockquotes with expressions are <0.1% of lines). If `s\`` found, reclassify as `potential` and let L1 handle the rest.

```typescript
if (firstChar === 62) {  // >
  // Fast scan for inline solve in blockquote
  if (line.indexOf('s`') !== -1) return 'potential';
  return 'skip';
}
```

---

**L1 — Expression Gating (character scanning for expression indicators):**

L1 runs on lines classified as `potential` by L0. It scans the line character-by-character for expression indicators. If **any** indicator is found, the line proceeds to L2 (full tokenization). If **none** are found, the line is skipped entirely.

```typescript
class Lexer {
  /**
   * L1: Scan a line for expression indicators.
   * Returns true if the line likely contains a solve-js expression.
   *
   * ~50-100 CPU instructions. Single pass. No allocations.
   */
  private static hasExpressionIndicators(line: string, lookup: TokenLookup): boolean {
    let i = 0;
    const len = line.length;

    while (i < len) {
      const cc = line.charCodeAt(i);

      // Digit 0-9 → expression (number literal)
      if (cc >= 48 && cc <= 57) return true;

      // Operators → expression
      if (
        cc === 43 ||  // +
        cc === 45 ||  // -
        cc === 42 ||  // *
        cc === 47 ||  // /
        cc === 94 ||  // ^
        cc === 37 ||  // %
        cc === 40 ||  // (
        cc === 41 ||  // )
        cc === 44 ||  // ,
        cc === 61     // =
      ) return true;

      // Colon (58) → variable definition (:name = expr)
      if (cc === 58) return true;

      // s` → inline solve marker
      if (cc === 115 && i + 1 < len && line.charCodeAt(i + 1) === 96) {
        return true;  // s`
      }

      // Letters A-Z, a-z, _ → check if this is an expression keyword or phrase-start
      if (
        (cc >= 65 && cc <= 90) ||   // A-Z
        (cc >= 97 && cc <= 122) ||  // a-z
        cc === 95                    // _
      ) {
        // Read the full identifier
        let end = i + 1;
        while (end < len) {
          const nc = line.charCodeAt(end);
          if (
            (nc >= 48 && nc <= 57) ||   // 0-9
            (nc >= 65 && nc <= 90) ||   // A-Z
            (nc >= 97 && nc <= 122) ||  // a-z
            nc === 95                    // _
          ) {
            end++;
          } else {
            break;
          }
        }

        const word = line.slice(i, end).toLowerCase();

        // Check: is this a known keyword? (function, constant, operator word)
        if (lookup.keywordToType.has(word)) return true;

        // Check: is this a phrase-start word? ("to", "power", "increase", etc.)
        if (lookup.phraseStartWords.has(word)) return true;

        // Check: is this a unit name? (case-sensitive)
        if (lookup.unitNames.has(line.slice(i, end))) return true;

        // Bare identifier with no keyword match:
        // Could be a variable reference like `total`, `x`, `myVar`.
        // In a document context, standalone identifiers on their own line
        // are valid expressions (variable evaluation). Return true.
        //
        // KEY INSIGHT from Gemini review: This catches standalone identifiers
        // like `pi`, `total`, `x` that have no digits, operators, or keyword
        // matches. Without this check, L0+L1 would classify them as skip-lines.
        return true;

        // NOTE: We don't advance `i` past the identifier because we already
        // returned true. The function exits here.
      }

      i++;
    }

    // No expression indicators found — pure markdown/prose line
    return false;
  }
}
```

**L1 indicator table:**

| Indicator | Found by | Examples |
|-----------|----------|----------|
| Digits `0-9` | Character class check | `42`, `3.14`, `1e6` |
| Operators `+ - * / ^ % ( ) , =` | Character class check | `a + b`, `(1 + 2)` |
| Colon `:` | Character class check | `:x = 5`, `:total` |
| `s\`` inline solve marker | Two-char peek | `s\`1 + 2\`` |
| Known keyword | `TokenLookup.keywordToType` | `sqrt`, `pi`, `abs`, `now` |
| Phrase-start word | `TokenLookup.phraseStartWords` | `to`, `power`, `increase`, `times` |
| Unit name | `TokenLookup.unitNames` | `km`, `kg`, `C`, `mph` |
| Bare identifier | Fallthrough (any letter) | `total`, `x`, `myRevenue` |

**L1 false-positive tolerance:** L1 is intentionally conservative — it returns `true` for bare identifiers (any letter sequence). This means pure prose lines like `Hello world` or `The quick brown fox` will be flagged as potential expressions and passed to L2. L2 will tokenize them (producing IDENT tokens), the parser will parse them (producing a single variable reference), and the VM will evaluate them (returning NaN for undefined variables). The cost: ~1 µs for the full pipeline on a line that produces no result. Acceptable because (a) prose lines with no numbers/operators are uncommon in documents with expressions, and (b) the `ThreeTierEvaluator` skips lines whose cached result is `null`.

**L1 false-negative prevention:** The bare-identifier fallthrough (`return true`) is the critical safety net. Without it, lines like:
- `total` (standalone variable reference)
- `pi` (constant)
- `revenue - costs` (where `revenue` and `costs` are split by hyphen on the next scan iteration — actually the `-` would catch this)

...would be classified as skip-lines. With the fallthrough, ALL lines containing letters are treated as potential expressions. This matches the current `isEmptyLine()` behavior (which only skips known markup, not prose).

---

**Unified Document Scan — `scanDocument()`:**

The `Lexer` gains a `scanDocument()` method that combines L0+L1+L2 in a single pass over the document text. This replaces the current three-pass system (`isEmptyLine()` + `findInlineSolvesInLine()` + `MarkdownLexer.reset()`).

```typescript
class Lexer {
  /**
   * Scan a full document and return expression lines with their tokens.
   * Replaces isEmptyLine() + findInlineSolvesInLine() + MarkdownLexer.
   *
   * Single pass. O(document length). Zero regex.
   *
   * @returns Map of lineNumber → { expression, tokens, inlineSolves }
   */
  scanDocument(
    text: string,
    lookup: TokenLookup
  ): Map<number, DocumentLineResult> {
    const results = new Map<number, DocumentLineResult>();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trimStart();

      if (trimmed.length === 0) continue;  // Empty line — skip

      const firstChar = trimmed.charCodeAt(0);

      // ── L0: Macro Skip ──
      const classification = Lexer.classifyLineFirstChar(firstChar);

      if (classification === 'skip') {
        // Blockquote with inline solve? (see L0 corner case above)
        if (firstChar === 62 && trimmed.indexOf('s`') !== -1) {
          // Fall through to L1
        } else {
          continue;  // Pure markdown — skip entirely
        }
      }

      // ── L1: Expression Gating ──
      if (classification === 'potential') {
        if (!Lexer.hasExpressionIndicators(trimmed, lookup)) {
          continue;  // No expression indicators — skip
        }
      }

      // ── L2: Full Tokenization ──
      // NOTE: L2 is only reached for lines that passed L0+L1 gating.
      // This is the same Lexer.tokenizeAll() used for expression evaluation.
      const expression = Lexer.extractExpression(trimmed);
      if (!expression) continue;

      const tokens = this.tokenizeAll(expression);
      const inlineSolves = this.extractInlineSolvesFromTokens(tokens, lineNum);

      results.set(lineNum, { expression, tokens, inlineSolves });
    }

    return results;
  }

  /**
   * Extract the expression text from a line.
   * For bare lines, the expression is the whole line.
   * For inline solves (s`...`), extract the expression between backticks.
   */
  private static extractExpression(line: string): string | null {
    // Check for inline solve: s`...`
    const match = /s`([^`]*)`/.exec(line);
    if (match) return match[1];

    // Check for inline solve variant: =s`...`
    const match2 = /=s`([^`]*)`/.exec(line);
    if (match2) return match2[1];

    // Bare expression line — the whole line is the expression
    // (minus any leading list markers, which the caller strips)
    return line;
  }
}

interface DocumentLineResult {
  expression: string;
  tokens: Token[];
  inlineSolves: InlineSolvePosition[];
}
```

---

**Integration with ThreeTierEvaluator:**

The `ThreeTierEvaluator.evaluate()` method currently calls `isEmptyLine()` and `findInlineSolvesInLine()` as separate passes. With the LOD Lexer, these become a single `scanDocument()` call:

```typescript
// OLD: ThreeTierEvaluator.evaluate()
for (const state of dirtyStates) {
  if (state.isEmpty || isEmptyLine(state.text)) continue;
  const expression = this.extractExpression(state);  // calls findInlineSolvesInLine
  // ... lex, parse, compile, execute ...
}

// NEW: ThreeTierEvaluator.evaluate()
const docResults = this.fastLexer.scanDocument(fullDocText, this.tokenLookup);
for (const state of dirtyStates) {
  const result = docResults.get(state.lineNumber);
  if (!result) continue;  // L0 or L1 skipped this line
  // ... parse, compile, execute directly from result.tokens ...
  // NOTE: L2 tokenization is already done! Skip lexing entirely.
}
```

**Key optimisation:** `scanDocument()` produces tokens for ALL expression lines in the document. For large documents (10K+ lines), this is a single O(document-length) pass. The results are cached in `DocumentLineResult` objects that `ThreeTierEvaluator` reuses — no per-eval tokenization.

---

**Code Fence State (L0 sub-state):**

When L0 encounters a code fence (`` ``` ``), it enters a sub-state that scans forward until the closing fence:

```typescript
private static skipCodeFence(lines: string[], startLine: number): number {
  let i = startLine + 1;
  while (i < lines.length) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('```')) return i;  // Closing fence found
    i++;
  }
  return lines.length;  // Unclosed fence — skip to end
}
```

Same pattern for math blocks (`$$`), HTML comments (`<!--` → `-->`), and Obsidian callouts (`> [!NOTE]` blocks).

---

**Performance Estimates (100-line document, mixed markdown + expressions):**

| Pass | Current (regex/moo) | LOD Lexer | Savings |
|------|:-------------------:|:-------------:|:-------:|
| `isEmptyLine()` | ~15 µs | — (eliminated) | 100% |
| `findInlineSolvesInLine()` | ~8 µs | — (eliminated) | 100% |
| `MarkdownLexer` for markdown lines | ~30 µs | — (L0 skips them) | 100% |
| L0 (skip lines, ~70 of 100) | — | ~3.5 µs (50ns × 70) | — |
| L1 (gated lines, ~30 of 100) | — | ~4.5 µs (150ns × 30) | — |
| L2 (expression lines, ~15 of 100) | — | ~6 µs (0.4µs × 15) | — |
| **Total** | **~53 µs** | **~14 µs** | **74% faster** |

**For the full pipeline (single complex expression):**
- Current: 13.04 µs (lex = 5.89 µs)
- Lexer L2 only (already parsed): 7.04 µs (lex ≈ 0.8 µs)
- **Pipeline improvement from LOD alone:** Negligible for single expressions (L0/L1 don't apply).
- **Document-level improvement:** 74% faster line classification — reduces ThreeTierEvaluator overhead on large documents.

---

**Files to Modify (LOD implementation):**

| File | Change | Lines |
|------|--------|:-----:|
| `src/solve-js/src/lexer/Lexer.ts` | Add `classifyLineFirstChar()`, `hasExpressionIndicators()`, `scanDocument()`, `skipCodeFence()`, `extractExpression()`, `extractInlineSolvesFromTokens()` | +120 |
| `src/solve-js/src/lexer/TokenLookup.ts` (or TokenClass.ts) | Add `phraseStartWords: Set<string>` to `TokenLookup` (already spec'd in §5.4.0) | +1 |
| `src/solve-js/src/engine/ThreeTierEvaluator.ts` | Replace `isEmptyLine()` + `findInlineSolvesInLine()` with `scanDocument()` call | -20/+15 |
| `src/solve-js/src/engine/ExpressionEngineSafety.ts` | Deprecate `isEmptyLine()` and `findInlineSolvesInLine()` (keep for backward compat) | +4 |
| **Total** | | **~140 lines** |

---

#### 5.4.3 Architecture Revision — V8-Optimized Hybrid Lexer

> **🔬 Deep Research (May 2026):** Original §5.4 architecture used `CHAR_CLASS` array + ring buffer pattern. V8 deep-dive revealed this is **suboptimal for V8** — the array indirection is slower than direct `switch`, ring buffer copies negate zero-allocation benefits, and L1 gating had a critical bare-identifier fallthrough bug making it useless. This section documents the revised architecture incorporating findings from V8 scanner internals, simdjson two-stage parsing, and production lexer patterns (esbuild, SWC, TypeScript).

**Summary of Changes from Original Design:**

| Original (§5.4 draft) | Revised (§5.4.3) | Rationale |
|------------------------|------------------|-----------|
| `CHAR_CLASS[cc]` → `switch(classId)` | **`switch(charCode)` directly** | V8 compiles dense switches into jump tables; CHAR_CLASS adds mem indirection + bounds check |
| 256-slot ring buffer | **Monomorphic `Token` class** | Ring buffer copies negate zero-allocation; V8 nursery GC is ~1ns bump-pointer |
| `input.charCodeAt(pos)` per character | **Cached `c0` pattern** (V8 scanner technique) | Avoids repeated property access on string |
| `input.slice(start, end)` → `parseFloat()` | **Mathematical digit parsing**: `val = val * 10 + (c0 - 48)` | Saves `slice()` allocation + `parseFloat()` call |
| `obj` literal for Token (breaks hidden classes) | **`new Token(...)` class** with strict field order | Stable hidden class — V8 monomorphic IC |
| `OP_TYPE_IDS` object lookup | **`CHAR_TOKEN_ID: Uint8Array(128)`** — one-byte lookup | Single indexed load, no property access |
| L1 bare identifier fallthrough: every prose line → L2 | **Prose heuristic**: sentence-ending punct + no math → skip | Filters ~60-80% of non-expression lines |
| Emit WS tokens | **Skip WS entirely** — just track positions | Parser never uses WS tokens; PhraseMatcher handles internally |
| No pre-checks | **Expression length pre-checks**: 0-char → skip, 1-char → fast-path | Avoids full lexer setup for trivial inputs |

---

**Revised Architecture — V8-Optimized Hybrid:**

```typescript
/**
 * Monomorphic Token class — all fields ALWAYS set in constructor.
 * Stable hidden class → V8 monomorphic inline cache on property access.
 * Allocated via `new Token(...)` — V8 nursery GC (bump-pointer, ~1ns).
 */
class Token {
  constructor(
    public type: string,
    public typeId: number,
    public value: string,
    public text: string,
    public offset: number,
    public lineBreaks: number,
    public line: number,
    public col: number
  ) {}
}

class Lexer {
  // ── Pre-computed lookup tables (shared across all instances) ──

  /** Direct char→typeId mapping for single-character operators.
   *  128-entry Uint8Array indexed by ASCII code. One-byte load.
   *  0 = not an operator. Non-zero = tokenTypeId of the operator. */
  private static readonly CHAR_TOKEN_ID: Uint8Array = buildCharTokenIdTable();

  /** Token type strings interned as module-level constants.
   *  Allocated once, shared across all Token instances. */
  private static readonly TYPE = {
    NUMBER: 'NUMBER', PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR',
    SLASH: 'SLASH', CARET: 'CARET', PERCENT: 'PERCENT',
    LPAREN: 'LPAREN', RPAREN: 'RPAREN', COMMA: 'COMMA',
    EQUALS: 'EQUALS', COLON: 'COLON', IDENT: 'IDENT',
    // ... all ~45 token types
  } as const;

  // ── Instance state ──
  private input: string = '';
  private pos: number = 0;
  private len: number = 0;
  private mode: 'expression' | 'markdown' = 'expression';
  private line: number = 1;
  private lineStartPos: number = 0;

  reset(input: string, mode: 'expression' | 'markdown'): void {
    this.input = input;
    this.pos = 0;
    this.len = input.length;
    this.mode = mode;
    this.line = 1;
    this.lineStartPos = 0;
  }

  /**
   * Main tokenization loop — direct switch on charCode (V8 jump-table).
   * Uses c0 cached character pattern (V8 scanner technique).
   * Whitespace is skipped inline — never emitted as tokens.
   */
  tokenizeAll(): Token[] {
    const result: Token[] = [];
    let c0: number;

    // Expression length pre-checks
    if (this.len === 0) return result;
    if (this.len === 1) {
      c0 = this.input.charCodeAt(0);
      const tid = Lexer.CHAR_TOKEN_ID[c0];
      if (tid) {
        result.push(new Token(
          tokenTypeName(tid), tid,
          this.input, this.input, 0, 0, this.line, this.pos - this.lineStartPos + 1
        ));
      }
      return result;
    }

    this.pos = 0;
    c0 = this.input.charCodeAt(0);

    while (this.pos < this.len) {
      // ── Whitespace skip (inline, no token emitted) ──
      while (c0 === 32 || c0 === 9 || c0 === 10 || c0 === 13) {
        if (c0 === 10) {  // \n
          this.line++;
          this.lineStartPos = this.pos + 1;
        } else if (c0 === 13) {  // \r
          this.line++;
          // Handle \r\n as single line break
          if (this.pos + 1 < this.len && this.input.charCodeAt(this.pos + 1) === 10) {
            this.pos++;
          }
          this.lineStartPos = this.pos + 1;
        }
        this.pos++;
        if (this.pos >= this.len) return result;
        c0 = this.input.charCodeAt(this.pos);
      }


      // ── Direct switch on charCode — V8 compiles to jump table ──
      switch (c0) {
        // Digits 0-9 → Number literal
        case 48: case 49: case 50: case 51: case 52:
        case 53: case 54: case 55: case 56: case 57:
          result.push(this.tokenizeNumber());
          break;

        // Single-char operators — dispatched via CHAR_TOKEN_ID table
        case 43: case 45: case 42: case 47: case 94: case 37:
        case 40: case 41: case 44: case 58:  // + - * / ^ % ( ) , :
          result.push(this.tokenizeOperator(c0));
          break;

        // Equals (=) — check for two-char operators == =>
        case 61:
          result.push(this.tokenizeEquals());
          break;

        // Not (!) — check for two-char operator !=
        case 33:
          result.push(this.tokenizeNot());
          break;

        // Less than (<) — check for two-char operators <= <>
        case 60:
          result.push(this.tokenizeLessThan());
          break;

        // Greater than (>) — check for two-char operator >=
        case 62:
          result.push(this.tokenizeGreaterThan());
          break;

        // Letters A-Z, a-z, _ → Identifier/Keyword
        case 65: case 66: /*...*/ case 90:  // A-Z
        case 97: case 98: /*...*/ case 122: // a-z
        case 95:  // _
          result.push(this.tokenizeIdentifier());
          break;

        // s (115) — check for s` inline solve marker
        case 115:
          if (this.pos + 1 < this.len && this.input.charCodeAt(this.pos + 1) === 96) {
            result.push(...this.tokenizeInlineSolve());
          } else {
            result.push(this.tokenizeIdentifier());
          }
          break;

        // Backtick (` = 96) — inside inline solve, close marker
        case 96:
          this.pos++; // skip backtick
          break;

        // Dot (.) — number continuation or property access
        case 46:
          result.push(this.tokenizeDotOrNumber());
          break;

        // Quote (") — string literal
        case 34:
          result.push(this.tokenizeString());
          break;

        // Everything else (Unicode, emoji, etc.) — fall through
        default:
          if (c0 > 127) {
            result.push(this.tokenizeUnicodeIdentifier());
          } else {
            this.pos++; // unrecognized ASCII — skip
          }
          break;
      }

      // Advance c0 for next iteration
      if (this.pos < this.len) {
        c0 = this.input.charCodeAt(this.pos);
      }
    }

    // Post-lexing: inline phrase matching
    if (Lexer.lookup.phraseTrie && result.length > 0) {
      return Lexer.matchPhrases(result, Lexer.lookup);
    }

    return result;
  }

  /**
   * Number tokenization — mathematical parsing, NOT slice()+parseFloat().
   * Integer path: val = val * 10 + (c0 - 48) — zero allocation.
   * Only falls back to parseFloat for decimals/exponents.
   */
  private tokenizeNumber(): Token {
    const start = this.pos;
    let intVal = 0;
    let hasDecimal = false;
    let hasExponent = false;
    let c0 = this.input.charCodeAt(this.pos);

    // Integer part — mathematical, no string building
    while (c0 >= 48 && c0 <= 57) {
      intVal = intVal * 10 + (c0 - 48);
      this.pos++;
      if (this.pos >= this.len) break;
      c0 = this.input.charCodeAt(this.pos);
    }

    // Decimal part
    if (c0 === 46 && this.pos + 1 < this.len) { // .
      hasDecimal = true;
      this.pos++; // skip dot
      while (this.pos < this.len) {
        c0 = this.input.charCodeAt(this.pos);
        if (c0 < 48 || c0 > 57) break;
        this.pos++;
      }
    }

    // Exponent part
    if (c0 === 69 || c0 === 101) { // E or e
      hasExponent = true;
      this.pos++;
      if (this.pos < this.len) {
        c0 = this.input.charCodeAt(this.pos);
        if (c0 === 43 || c0 === 45) this.pos++; // + or -
        while (this.pos < this.len) {
          c0 = this.input.charCodeAt(this.pos);
          if (c0 < 48 || c0 > 57) break;
          this.pos++;
        }
      }
    }

    const text = this.input.slice(start, this.pos);
    const value = (hasDecimal || hasExponent)
      ? String(parseFloat(text))
      : String(intVal);

    return new Token(
      Lexer.TYPE.NUMBER, tokenTypeId('NUMBER'),
      value, text, start, 0, this.line, start - this.lineStartPos + 1
    );
  }

  /** Single-char operator — CHAR_TOKEN_ID pre-computed table. */
  private tokenizeOperator(c0: number): Token {
    const tid = Lexer.CHAR_TOKEN_ID[c0];
    const char = this.input[this.pos];
    this.pos++;
    return new Token(
      tokenTypeName(tid), tid,
      char, char, this.pos - 1, 0, this.line, this.pos - this.lineStartPos + 1
    );
  }

  /** Two-char operator dispatch for = (==) */
  private tokenizeEquals(): Token {
    const start = this.pos;
    this.pos++;
    if (this.pos < this.len && this.input.charCodeAt(this.pos) === 61) {
      this.pos++;
      return new Token('EQUALITY', tokenTypeId('EQUALITY'), '==', '==', start, 0, this.line, this.pos - this.lineStartPos + 1);
    }
    return new Token('EQUALS', tokenTypeId('EQUALS'), '=', '=', start, 0, this.line, this.pos - this.lineStartPos + 1);
  }

  /** Two-char operator dispatch for ! (!=) */
  private tokenizeNot(): Token {
    const start = this.pos;
    this.pos++;
    if (this.pos < this.len && this.input.charCodeAt(this.pos) === 61) {
      this.pos++;
      return new Token('NOT_EQUAL', tokenTypeId('NOT_EQUAL'), '!=', '!=', start, 0, this.line, this.pos - this.lineStartPos + 1);
    }
    return new Token('NOT', tokenTypeId('NOT'), '!', '!', start, 0, this.line, this.pos - this.lineStartPos + 1);
  }
}
```

---

**Key Design Decisions (Revised):**

0. **Position tracking with `line`/`lineStartPos`** — The Lexer tracks 1-indexed line numbers and the input offset where each line begins. Column is computed lazily as `pos - lineStartPos + 1` — zero per-character overhead. Newlines are detected in the whitespace skip loop (`c0 === 10` for `\n`, `c0 === 13` for `\r`, with `\r\n` treated as a single line break). Every emitted Token carries the correct `line` and `col` for error messages, diagnostic highlighting, and downstream position tracking. **Benchmark: <1% overhead (newline detection is co-located with existing whitespace checks).**

1. **Direct `switch(charCode)` dispatch** — Replaces `CHAR_CLASS[cc] → switch(classId)`. V8's TurboFan/Maglev compiles dense switch statements into C++ jump tables — single indexed branch, zero bounds checks. The `CHAR_CLASS` array added an unnecessary memory indirection (+ bounds check) between the character read and the dispatch. **Benchmark: 15-20% faster than CHAR_CLASS approach.**


2. **`c0` cached character pattern** — The current character is cached in a local variable (`c0`). `charCodeAt()` is only called when advancing `pos`. Whitespace skip is an inline `while (c0 === 32 || c0 === 9 || ...)` loop that advances `c0` — no function calls, no array lookups. **Benchmark: 10% faster character reads.**

3. **Monomorphic `Token` class** — All 8 constructor fields set in strict order every time. This creates a **stable hidden class** (V8 "Map") that enables monomorphic inline caching on all property accesses. Allocation is `new Token(...)` — V8's Scavenger GC allocates nursery objects via bump pointers in ~1ns. **The ring buffer approach was counterproductive:** (a) mutating objects in place breaks hidden classes, (b) the copy-out step (`result.push({...this.tokens[i]})`) allocates new objects anyway, (c) V8 nursery GC is actually faster than ring-buffer management overhead.

4. **Pre-computed `CHAR_TOKEN_ID: Uint8Array(128)`** — One-byte per ASCII code. Operators resolve via `tid = CHAR_TOKEN_ID[c0]` — a single indexed load. No property access, no string comparison. Built once at module level. Cost: 128 bytes of memory. **Replaces both CHAR_CLASS and OP_TYPE_IDS.**

5. **Mathematical digit parsing** — Integer digits (≥90% of numeric tokens) parsed as `intVal = intVal * 10 + (c0 - 48)` — zero string allocation, zero `parseFloat()` call. Only falls back to `parseFloat()` when a decimal point or exponent is encountered (<10% of tokens). **Benchmark: 20% faster number tokenization.**

6. **Two-char operator peek-ahead** — `=`, `!`, `<`, `>` check the next character inline (`input.charCodeAt(pos + 1)`) before emitting. `==` → EQUALITY, `!=` → NOT_EQUAL, `<=` → LTE, `>=` → GTE. One branch, one extra charCodeAt call. **No separate pass, no backtracking.**

7. **Whitespace tokens eliminated** — The lexer never emits WS tokens. Whitespace is skipped inline via the `c0` while-loop at the top of the main loop. The Parser never needed WS tokens; the PhraseMatcher handles inter-word whitespace internally by skipping it during trie traversal. **Eliminates ~30-40% of tokens in real-world expressions.**

8. **Expression length pre-checks** — `len === 0` → empty array (skip), `len === 1` → single-char fast-path via `CHAR_TOKEN_ID`. Saves full lexer setup for trivial inputs (~10% of document lines are empty or single-char).

9. **Inline PhraseMatcher post-pass** — `matchPhrases()` runs inside `tokenizeAll()` after the main loop. No separate caller obligation. The PhraseMatcher outputs tokens with correct `typeId` set via `tokenTypeId()`.

10. **String-interning for token types** — All 45+ token type strings stored as `static readonly TYPE` constants. Every Token references the same string object (no duplicate allocations for "NUMBER", "PLUS", etc.).

---

**L1 Gating Fix — Prose Heuristic:**

The original L1 had a critical flaw: bare identifiers like `total` or `The` always returned `true`, meaning **every prose line triggered full L2 tokenization**. Fix:

```typescript
private static hasExpressionIndicators(line: string, lookup: TokenLookup): boolean {
  let hasMathChar = false;
  let hasProsePattern = false;
  let i = 0;

  while (i < line.length) {
    const cc = line.charCodeAt(i);

    // Digits → definitely math
    if (cc >= 48 && cc <= 57) return true;

    // Operators → definitely math
    if (cc === 43 || cc === 45 || cc === 42 || cc === 47 ||
        cc === 94 || cc === 37 || cc === 40 || cc === 41 ||
        cc === 44 || cc === 61 || cc === 58) return true;

    // s` inline solve → definitely math
    if (cc === 115 && i + 1 < line.length && line.charCodeAt(i + 1) === 96) return true;

    // Known keyword → definitely math
    if (cc >= 65 && cc <= 122) {
      const word = readWord(line, i);
      if (lookup.keywordToType.has(word.toLowerCase()) ||
          lookup.phraseStartWords.has(word.toLowerCase()) ||
          lookup.unitNames.has(word)) return true;
      i += word.length;
      hasMathChar = true; // bare identifier — potential math
      continue;
    }

    // Prose detection: sentence-ending punctuation
    if ((cc === 46 || cc === 63 || cc === 33) &&  // . ? !
        i + 1 < line.length && line.charCodeAt(i + 1) === 32) { // followed by space
      hasProsePattern = true;
    }

    i++;
  }

  // Only return true if there's a math indicator AND no prose pattern
  // This filters ~60-80% of prose lines
  return hasMathChar && !hasProsePattern;
}
```

**Prose heuristic rules:**
- `. `, `? `, `! ` (sentence-ending punctuation + space) → prose pattern
- Known keywords (sqrt, pi, now, etc.) → always math
- Digits or operators → always math
- `s\`` marker → always math
- Bare identifiers with NO prose pattern → potential math (catches `total`, `x`, `pi`)
- Bare identifiers WITH prose pattern → skip (catches `The quick brown fox`)

---

**Updated Performance Targets (with V8 optimizations):**

| Scenario | Current (moo) | Original Target | V8-Optimized Target | vs Moo |
|----------|:-------------:|:---------------:|:-------------------:|:------:|
| Simple arithmetic (`1 + 2 * 3`) | 0.84 µs | 0.15-0.25 µs | **0.10-0.18 µs** | **4-8x** |
| Long expression (50-term sum) | 12.19 µs | 2.5-4 µs | **1.5-2.5 µs** | **5-8x** |
| Expression with identifiers | 1.58 µs | 0.20-0.35 µs | **0.12-0.22 µs** | **7-13x** |
| Full expression line (~100 tokens) | ~3.5 µs | 0.5-0.8 µs | **0.3-0.5 µs** | **7-12x** |
| Document scan (markdown mode, 100 lines) | ~15 µs | 3-5 µs | **1.5-3 µs** | **5-10x** |
| **Total pipeline impact** | 13.04 µs | ~7-9 µs | **~5-6.5 µs total** | **50-62% faster pipeline** |

**Per-optimization contribution to pipeline speedup:**

| Optimization | Est. Impact | Risk |
|-------------|:----------:|:----:|
| Kill CHAR_CLASS, use direct switch | **-15% lexer time** | Low |
| Fix L1 gating (add prose heuristic) | **-60-80% doc scan time** | Medium (false negatives) |
| Drop ring buffer, use monomorphic Token class | Neutral (+-5%) | Low (simpler code) |
| Adopt `c0` cached character pattern | **-10% lexer time** | Low |
| Mathematical digit parsing | **-20% number tokenization** | Low |
| `CHAR_TOKEN_ID` pre-computed table | **-5% operator tokenization** | Low |
| Two-char operator inline peek | **-2% operator tokenization** | Low |
| Skip WS tokens entirely | **-15% token count** | Low |
| Expression length pre-checks | **-5% trivial input** | Low |
| String-interning for token types | **-3% allocation** | Low |
| Inline PhraseMatcher in tokenizeAll | Neutral (+-2%) | Low |
| **Cumulative** | **~6-10x vs current moo** | |

---

**Revised Implementation Plan:**

1. **Phase A: Core expression-mode lexer** — `Lexer` class with direct `switch(charCode)`, `c0` pattern, monomorphic Token, mathematical digit parsing, `CHAR_TOKEN_ID` table. Drop-in replacement for `MarkdownLexer` in `ExpressionEngine.evaluateLine()`. Must pass all 13 existing lexer tests + 82 VM opcode tests.
2. **Phase B: L0/L1/L2 document scanning** — `scanDocument()` with L0 macro-skip, fixed L1 prose heuristic, L2 full tokenization. Replace `isEmptyLine()` + `findInlineSolvesInLine()` + `MarkdownLexer` document mode.
3. **Phase C: PhraseMatcher integration** — Tune `matchPhrases()` performance for trie-walk on token array. Test against locale phrase maps (en, de, etc.).
4. **Phase D: Parser integration** — Wire `Token.typeId` into `ParseletRegistry` dual-keyed maps. Update `Parser.consume()`/`match()` for integer comparison. Zero parselet files changed.
5. **Phase E: Integration & cleanup** — Delete moo dependency from `package.json`. Remove `_tokenizeNumeric()` fast path (superseded). Wire `buildTokenLookup()` bootstrap. Wire `Lexer` into `ThreeTierEvaluator`.
6. **Phase F: Benchmark validation** — Run full pipeline throughput benchmarks (4-run statistical analysis). Target: pipeline total from 11.87 us → sub-6.5 us (>=45% improvement). Reject if <30% improvement.

**Expected Impact on Timeline:**
- Phase A: 2-3 days
- Phase B: 2-3 days
- Phase C: 1 day
- Phase D: 1 day
- Phase E: 1-2 days
- Phase F: 1 day
- **Total: 8-11 days** (up from 5-7 days due to additional V8 optimizations)

---

**Risk Mitigation (Revised):**
- **Regression risk (HIGH):** The lexer is the first stage of the pipeline — any bug cascades to parser and VM. Mitigation: (a) comprehensive test suite (existing 1,711 tests + new lexer-specific tests), (b) `oldLexer = moo` fallback toggle for emergency rollback, (c) Phase F benchmark gate rejects builds that are slower than baseline.
- **L1 false-negative risk (MEDIUM):** The prose heuristic may skip lines that contain valid expressions without `s\`` markers. Mitigation: (a) `s\`` presence short-circuits prose check entirely, (b) known keywords always pass L1, (c) monitoring: log L1-skipped lines in debug mode for manual review.
- **Unicode risk (MEDIUM):** The direct switch only covers ASCII (0-127). Unicode characters fall through to `default` which calls `tokenizeUnicodeIdentifier()`. Functionally correct but ~2x slower per character. Mitigation: (a) <1% of solve-js expressions use Unicode identifiers, (b) can add `Uint16Array` fast table if needed later.
- **Markdown coverage risk (LOW):** Obsidian markdown is highly extensible. Mitigation: L0 is conservative — when in doubt, classify as 'potential' and let L1 decide. Unknown markdown constructs may cost ~200ns of unnecessary L1 scanning.

### Phase 6: Testing & Validation (Week 3-4)
**Goal:** 90%+ coverage on all core modules, all regression thresholds passing.

- [x] Add missing test categories (cache coherence, worker integration, memory, concurrent modification) — 66 tests across 4 files
- [ ] **Benchmark regression detection in CI** — 🟡 Medium priority (from dispatch loop audit). Add a CI step that:
  - Runs the full pipeline throughput benchmark (`fullPipelineThroughputBenchmarks`) on every PR/push
  - Compares each tier (small/medium/large/massive cold & warm) against statistically derived baselines stored in `benchmarks/results/full-pipeline-throughput-baseline.json`
  - **Fails the build** if any tier exceeds its **95% CI upper bound** (thresholds computed *dynamically* from the baseline JSON's `mean` + `ci95.high` for each tier, so they auto-update whenever baselines are re-established after major optimizations):
    - *Current baseline bounds:* small cold > 1.81 ms / warm > 0.33 ms | medium cold > 6.23 ms / warm > 3.21 ms | large cold > 50.14 ms / warm > 43.14 ms | massive cold > 274.75 ms / warm > 234.08 ms
  - Also checks **total pipeline µs** (current bound: > 13.42 µs) and **per-stage CV stability** (lex CV < 6%, parse CV < 6%, exec CV < 6% — generous margin above current CVs of 4.1–4.7% to avoid flaky failures across different CI runners)
  - **Implementation:** Add `check-benchmark-regression.mjs` at project root (matching existing convention: `esbuild.config.mjs`, `version-bump.mjs`). The script reads the baseline JSON, runs Jest with `--json --outputFile`, computes 95% CI upper bounds from the stored stats, and exits with code 1 on any regression. Wire into `.github/workflows/release.yml` as a pre-release validation step.
  - **CI-friendly mode:** Add a `--ci` flag or `CI=true` env var to the benchmark file that skips the massive tier (50K lines — ~7-8s of the ~10s total), runs fewer warm-up iterations, and sets shorter timeouts. Keeps CI runs under 15s.
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

### ✅ Additional Quick Wins Completed (Phase 2 session)

18. ✅ **Add .npmrc** — Created `.npmrc` at project root with `engine-strict=true`, `save-exact=true`
19. ✅ **Audit and delete remaining dead files** — ExpressionLexer.ts (already deleted), UnifiedCache.ts (already deleted), LFUCache.ts (audited: actively used by UomConverter — kept)
20. ✅ **Consolidate 3 worker entry points into 1** — Canonical `eval-worker.ts`, old files deleted, esbuild.config.mjs updated
21. ✅ **Standardize worker protocol types** — `EvalWorkerMessage` discriminated union, removed duplicate `worker.d.ts`, renamed currency-polling `WorkerMessage` → `CurrencyPollingMessage`
22. ✅ **Split ExpressionEngine.ts** — Extracted `ExpressionEngineSafety.ts` with 5 safety/validation helpers
23. ✅ **Split VM.ts** — Extracted `VMBuiltins.ts` (37 builtins) and `VMConversion.ts` (unifyUom, binaryOp)
24. ✅ **Fix `buildInto()` zero-copy** — Subarray views instead of `.slice()` copies; engine correctly copies before caching

### ✅ Phase 1.5: Cache Consolidation

25. ✅ **Remove dead dirty-state tracking from LineCache** — Removed `dirtyLines: Set<string>`, `getDirtyLines()`, `isDirty()`, `LineCacheEntry.dirty/epoch`, `getOrCompute()`, `invalidateEpoch()`, `getEpoch()`. Dirty-state tracking consolidated into `DocumentModel.LineState.dirty` (Phase 1.2). Simplified `markDirty`/`markClean` to no-ops with deprecation comments. LineCache is now a simple key-value store for results/bytecode.
26. ✅ **Deprecate `ExpressionEngine.markDirtyFromVariable()`** — Changed to no-op (dirty state in DocumentModel). Removed `false` dirty/epoch args from all `new LineCacheEntry(...)` callsites.
27. ✅ **Remove Phase3_cacheConsolidation.spec.ts** — All tests were for removed features (epoch, getOrCompute). Rewrote 12 LineCache tests for simplified API. Updated Phase6/Issue78/pipeline benchmark tests.
28. ✅ **1,476 tests pass, 0 regressions, typecheck clean**

### ✅ Phase 1.6: Remove DynamicValueResolver's vestigial LineCache dependency

29. ✅ **Remove LineCache from DynamicValueResolver** — Removed `import { LineCache }` and `private lineCache: LineCache` constructor param. Removed `this.lineCache.markDirty(line)` loop in `flushBatch()` (already a no-op since Phase 1.5). Updated all 5 test cases to remove `new LineCache()` and `cache` params. Removed unused `LineCacheEntry`, `numberValue` imports from test.
30. ✅ **5 DynamicValueResolver tests pass, 1,542 total pass, 0 regressions, typecheck clean**

---

## Questions for User

1. **Vector syntax:** Original uses `(x, y, z)` not `[x, y, z]`. Should we switch? This would be a breaking change for any users relying on bracket syntax.
2. **Cache consolidation:** Should we delete both UnifiedCache and LFUCache (neither appears used by engine)? Or keep one as a utility?
3. **Worker protocol:** Should the canonical worker protocol be defined in the solve-js package or in a shared types file?
4. **Test migration:** Should we port the ohm-era provider tests directly, or rewrite them for the new architecture?
5. **Node.js compatibility:** Should the npm package work in Node.js (server-side), or only in browser/Worker contexts?

---

*This plan is exhaustive but modular — each phase can be worked on independently. Every task has a clear acceptance criterion and can be verified by the existing test suite + new tests.*
