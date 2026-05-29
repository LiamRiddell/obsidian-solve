# TODO_CLAUDE — obsidian-solve Handoff Document

> **Generated:** 2026-05-29 | **Auditor:** Claude Sonnet 4.6 (deep code + architecture review)
> **Based on:** Full read of `PROJECT_ETHOS.md`, `ARCHITECTURE_PRINCIPLES.md`, `MASTER_PLAN.md`,
> `TODO.MD`, `IMPLEMENTATION_CONCERNS.md`, `IMPROVEMENTS_V2.md`, `solve-engine-architecture.html`,
> `ExpressionEngine.ts`, `ThreeTierEvaluator.ts`, `DocumentModel.ts`, `MarkdownEditorViewPlugin.ts`.
>
> **Current state:** 88 test suites, 1,966 tests passing. Phases 1–5 complete including full
> Lexer rewrite, DocumentModel, ThreeTierEvaluator, ValueArena, PageManager, VMCheckpoints.
> What follows is a prioritised list of remaining gaps — bugs, code-quality issues, and
> deferred optimisations — ready for an agent to pick up one phase at a time.
>
> **Rules for this agent:**
> 1. Read `PROJECT_ETHOS.md` first. Sub-millisecond pipeline. Correctness before speed.
> 2. One commit per logical unit. No large-bang PRs.
> 3. No `any` types. `ErrorFactory` everywhere. JSDoc on every public method.
> 4. Benchmark before **and** after any performance change. Record delta.
> 5. Never change behaviour without a test. Failing tests block shipping.

---

## P0 — Correctness Bugs (fix before anything else)

### P0.1 — `MarkdownEditorViewPlugin.addHighlightDecorations()` is dead code

**File:** `src/app/codemirror/MarkdownEditorViewPlugin.ts`

`addHighlightDecorations()` is called inside `buildDecorations()` for every full-line expression:
```ts
this.addHighlightDecorations(line.text, line.number);
```
The method calls `this.highlightProvider.getLineHighlights(...)` but **the returned decorations
are never added to `builder`**. This means highlights are computed and immediately discarded —
the CPU cost is paid but the user sees nothing. Either:

- Wire the returned ranges into `builder.add(...)`, or
- Remove the call entirely (and potentially `SolveHighlightProvider` if it has no other callers).

**Acceptance:** Highlight decorations either appear in the editor, or the dead call and
`SolveHighlightProvider` import are cleanly removed. No functional regression.

---

### P0.2 — Inline solves bypass ThreeTierEvaluator (no bytecode caching)

**File:** `src/app/codemirror/MarkdownEditorViewPlugin.ts` → `buildInlineSolveDecorations()`

Inline solve expressions (`s\`...\``) are evaluated by calling `engine.evaluateLine()` directly,
bypassing the ThreeTierEvaluator entirely. This means:
- No Tier-2 cached bytecode execution for repeated solves.
- No DAG tracking for inline-solve variable reads.
- `findInlineSolvesInLine()` is still called here even though the new `Lexer.scanDocument()` now
  detects inline solves during document classification.

**Fix:**
1. Remove the duplicate `findInlineSolvesInLine()` call from `buildDecorations()`.
2. Inline solve positions are already in `lineState.expression` / `lineState.reads` after
   `ThreeTierEvaluator.evaluate()` processes the line — retrieve them from `lineState` instead.
3. The result for an inline-solve line is already stored in `lineState.result`; render it from
   there rather than re-evaluating via a direct engine call.

**Acceptance:** Inline solve results still render correctly. Warm scroll (Tier 2) no longer
re-evaluates inline solves from scratch. Test: write an inline-solve line, scroll away, scroll
back — Tier 2 should fire (check `tierCounts.tier2` in evaluator debug output).

---

### P0.3 — `ConvertParselet` rejects parenthesised source expressions

**File:** `src/solve-js/src/providers/uom/` (ConvertParselet)
**Ref:** `TODO.MD → #11`

`convert (100 cm + 1 m) to mm` returns NaN. `convert 100 cm to m` works.
The parselet expects a simple `value + UNIT` token pair, not an arbitrary sub-expression.

**Fix:** Let ConvertParselet call `parseExpression(0, builder)` recursively for the left-hand
side, then consume the `to` keyword and the target unit. The existing Pratt parser handles
parenthesised sub-expressions naturally — ConvertParselet just needs to delegate.

**Acceptance:**
- `convert (100 cm + 1 m) to mm` → `1100 mm`
- `convert (1 km + 500 m) to m` → `1500 m`
- All existing UoM tests still pass.

---

## P1 — Performance (measurable wins with clear targets)

### P1.1 — Unit conversion LRU cache (84% reduction on UOM paths)

**Ref:** `TODO.MD → P1 #3`
**Cost:** 5,930 ns per conversion; target ~930 ns after caching.

Most unit conversions in a document repeat (`cm→m`, `USD→GBP`, `kg→lb`). Add a bounded LRU
cache in the UoM opcode handler:

```ts
// Keyed by `${value}:${fromUnit}:${toUnit}` — simple string join
// Size: 256 entries (covers typical document patterns)
// Eviction: LRU (LFUCache already exists and is used by UomConverter — extend it)
```

**Rules:**
- Cache is per-engine-instance (not global) to avoid cross-document state.
- Cache is cleared when the engine is cleared (`engine.clear()`).
- Benchmark before and after using the VM benchmark suite (`npx jest "benchmarks/vm"`).

**Acceptance:**
- `unit_conversion` VM benchmark improves by ≥50% on warm cache.
- All UoM provider tests still pass.
- New cache hit/miss tests in the UoM spec.

---

### P1.2 — `hasDirtyLinesBefore()` is O(N) on every scroll event

**File:** `src/solve-js/src/engine/ThreeTierEvaluator.ts` → `hasDirtyLinesBefore()`

Every `setViewport()` call (i.e., every scroll) scans from line 1 to `startLine - 1` looking for
a dirty line. For a 10,000-line document with the viewport at line 5,000, this is 4,999 map
lookups per scroll frame.

**Fix:** Maintain a `dirtyLineCount: number` counter in `DocumentModel` that is:
- Incremented in `markDirty()` and `markDirtyByLineNumber()`.
- Decremented in `updateLineResult()` (which calls `state.dirty = false`).
- Reset to `lineCount` in `setDocument()` and `invalidateAll()`.
- Reset to 0 in `clear()`.

`ThreeTierEvaluator.hasDirtyLinesBefore()` can then check `doc.getDirtyCountBefore(position)`
via an O(log N) range query on the SegmentTree (add an aggregate dirty-count field to treap
nodes), or at minimum use a simple O(1) "any dirty lines exist at all" early-exit to skip the
full scan when the document is clean (the common case during smooth scroll).

**Acceptance:**
- Scroll benchmarks (`setViewport` path) show no regression.
- `hasDirtyLinesBefore()` returns `false` in O(1) when no dirty lines exist anywhere.

---

### P1.3 — Split `initDispatchTable()` (code hygiene, ~380 lines)

**File:** `src/solve-js/src/vm/VM.ts` or wherever the dispatch table lives.
**Ref:** `MASTER_PLAN.md → Phase 5 → "Split initDispatchTable()"` (the one remaining ✅ gap).

CODING_STANDARDS.md has a 50-line soft limit on functions. `initDispatchTable()` is ~380 lines
of opcode-handler registrations. It is not branching logic but it violates the spirit of the
standard.

**Fix:** Split by opcode category:
```ts
initArithmeticHandlers(table)    // ADD, SUB, MUL, DIV, MOD, EXP, NEG
initStackHandlers(table)         // PUSH_NUM, PUSH_STR, POP, DUP, HALT, LOAD_VAR, STORE_VAR
initConversionHandlers(table)    // CONVERT, UNIFY_UOM, FORMAT_UOM
initDatetimeHandlers(table)      // DATE_ADD, DATE_SUB, DATE_DIFF, DATE_FORMAT, NOW
initVectorHandlers(table)        // VEC_CREATE, VEC_ADD, VEC_DOT, VEC_CROSS, VEC_NORM
initComparisonHandlers(table)    // EQ, NEQ, LT, GT, LTE, GTE
initBitwiseHandlers(table)       // BIT_AND, BIT_OR, BIT_XOR, BIT_NOT, SHL, SHR
initFunctionHandlers(table)      // CALL_FUNC, CALL_BUILTIN
```

Each helper is a plain function, not a class method — no test changes required, no behaviour
change. One commit.

**Acceptance:** All 1,966 tests still pass. `VM.ts` has no function exceeding 60 lines. Typecheck clean.

---

### P1.4 — Batch-parse independent expressions (Tier-1 throughput)

**Ref:** `TODO.MD → P1 #4`

When `ThreeTierEvaluator.evaluate()` processes multiple dirty Tier-1 lines, each line calls
`engine.evaluateLine()` which internally calls `lexer.resetExpression()` + `parser.load()` +
`parser.parseExpression()` separately. For N dirty lines this is N separate Parser.load() calls.

**Fix:** Add `engine.compileAll(expressions: string[])` that calls `scanDocument()` once for all
expressions, then loops through results calling `parser.load()` + `parser.parseExpression()` per
expression. The lexer scan is already batch-capable via `scanDocument()`.

Note: This is a measurable win only when multiple Tier-1 lines fire simultaneously (e.g., first
load, or a paste of 10+ lines). Profile first — if single-line edits dominate, defer this.

**Acceptance:**
- `fullPipelineThroughputBenchmarks` shows ≥10% improvement on `large` (2,000-expression) cold eval.
- All existing batch-eval tests pass.

---

## P2 — Code Quality (ongoing, non-blocking)

### P2.1 — `evaluateWithTokens` / `evaluateExpressionWithDiagnostic` DRY violation

**File:** `src/solve-js/src/engine/ExpressionEngine.ts`

Both methods contain nearly identical code for:
1. Safety checks (`checkExpressionLength`, `checkExpressionComplexity`)
2. Bytecode cache lookup
3. `builderPool` → `parser.load()` → `parser.parseExpression()` → `builder.buildInto()`
4. `executeBytecode()` + stack cleanup
5. `lineCache.set()`

The diagnostic variant adds ~50 lines of `pipeline.fire*()` calls around the same logic.
This is a maintenance hazard — a fix to the core path must be applied twice.

**Fix:** Extract a private `evaluateCore(expression, tokens, lineNumber, hasParens): Value` that
performs steps 1–5 without any diagnostic calls. `evaluateWithTokens` calls it directly.
`evaluateExpressionWithDiagnostic` wraps it with `if (hasCollectors) pipeline.fire*()` guards
around each step. Stack cleanup logic extracted to a private `cleanStack(stackBefore)` helper.

**Acceptance:** Behaviour identical. `evaluateWithTokens` and `evaluateExpressionWithDiagnostic`
each <100 lines. All tests pass. No new `any` types introduced.

---

### P2.2 — `applyChanges()` non-overlapping precondition undocumented

**File:** `src/solve-js/src/engine/DocumentModel.ts` → `applyChanges()`
**Ref:** `IMPROVEMENTS_V2.md → item 7`

The method processes changes in reverse order (highest `startLine` first). If two changes overlap,
the result is silently wrong. The existing JSDoc says "Precondition: changes must be non-overlapping"
but does nothing to enforce or detect violations.

**Fix:**
```ts
// In applyChanges(), before the sorted loop:
if (process.env.NODE_ENV !== 'production') {
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const aEnd = a.startLine + a.deleteCount - 1;
    if (aEnd >= b.startLine) {
      throw ErrorFactory.validation(
        'OVERLAPPING_LINE_CHANGES',
        `LineChange at startLine=${a.startLine} overlaps with startLine=${b.startLine}`
      );
    }
  }
}
```

**Acceptance:** New test in `DocumentModel.spec.ts` verifies that overlapping changes throw in
dev mode. Production build is unaffected (tree-shaken by esbuild). All existing tests pass.

---

### P2.3 — Jest memory leak (worker force-exits during FullPipeline tests)

**Ref:** `TODO.MD → P3 #10`

The `ThreeTierEvaluator` tests (and FullPipeline benchmarks) create `CompilationWorkerManager`
instances that are never terminated, causing Jest to force-exit worker processes and emit
`--detectOpenHandles` warnings. This obscures real failures.

**Fix (one of the following, in order of preference):**
1. In all test files that construct `ThreeTierEvaluator`: call `evaluator.terminateWorker()` in
   `afterEach` / `afterAll`.
2. Add `jest.config.js` option: `--workerIdleMemoryLimit=512MB` + `--forceExit` (nuclear option,
   not preferred — masks the root cause).
3. Add a Jest `globalTeardown` that terminates any lingering Worker threads.

Also add `--expose-gc` to the Jest Node options and call `global.gc?.()` in `afterAll` blocks in
heavy test suites (FullPipeline, ThreeTierEvaluator, MemoryLeak).

**Acceptance:** `npx jest` completes without `--forceExit` being needed. No
"A worker process has failed to exit gracefully" warnings.

---

### P2.4 — `djb2Hash` lives in the wrong module

**Ref:** `IMPROVEMENTS_V2.md → item 5`
**File:** `src/solve-js/src/utilities/Hash.ts` (already extracted — verify this is where it lives)

Verify `djb2Hash` is imported from `@solve-js/utilities/Hash` in `DocumentModel.ts`.
If it is still defined inline in `DocumentModel.ts`, move it.

Additionally: the hash is only djb2 (quality adequate for change-detection but not cryptographic).
Add a JSDoc comment making this clear so no future agent replaces it with a "better" hash without
benchmarking — `djb2Hash` is ~3 ns per call, which is appropriate for a per-keystroke hot path.

---

## P3 — Deferred Optimisations (parse + compile, 46.7% of pipeline)

> **Read this before touching anything in P3:**
> Every item here requires a before/after benchmark run using `fullPipelineThroughputBenchmarks`.
> Target improvement for the batch: combined Parse+Compile stage from ~46.7% → ≤30% of total.
> Do not proceed to the next item unless the previous one shows a ≥3% pipeline speedup with CV < 8%.
> Items are ordered by estimated effort-to-impact ratio.

### P3.1 — Inline common parselets (binary ops, number literals, parens)

**Ref:** `MASTER_PLAN.md → §5.5 → "Inline common parselets"`

Instead of table-dispatching to a `NumberParselet`, `BinaryOpParselet`, and `GroupingParselet`
object for every token, handle the three most common cases inline in `parseExpression()`:

```ts
// Inline fast path — no parselet lookup, no virtual call
if (token.type === 'NUMBER') {
  builder.emitNumber(parseFloat(token.value));
  builder.emitOpcode(OpCode.PUSH_NUM);
  // continue to infix loop
} else if (token.type === 'LPAREN') {
  this.parseExpression(0, builder);
  this.consume('RPAREN');
} else {
  // Existing parselet table lookup (covers IDENT, UNIT, PREFIX OPS, etc.)
  const prefix = this.registry.getPrefix(token.typeId);
  // ...
}
```

Estimated impact: **1.4–1.8× faster** for arithmetic-heavy expressions (~70% of real-world use).

**Acceptance:** All 1,966 tests pass. `fullPipelineThroughputBenchmarks` `simple` cold tier improves by ≥5%.

---

### P3.2 — Fixed-buffer bytecode emission (replace Array.push in BytecodeBuilder)

**Ref:** `MASTER_PLAN.md → §5.5 → "Fixed-buffer bytecode emission"`

`BytecodeBuilder` currently uses dynamic `push()` on growing arrays for opcodes and numbers.
Each `push()` may trigger an amortised resize allocation.

**Fix:** Pre-allocate fixed `Uint8Array(512)` and `Float64Array(128)` with tracked write cursors.
On overflow (rare, <5% of expressions): fall back to dynamic growth. `buildInto()` returns
`new Uint8Array(pool.buffer, 0, opWritePos)` — zero-copy subarray, no copy needed for caching
(already handled by ExpressionEngine copying before cache).

**Acceptance:** BytecodeBuilder benchmarks (if they exist) show ≥5% improvement. All tests pass.

---

### P3.3 — Pre-computed token type dispatch in Parser

**Ref:** `MASTER_PLAN.md → §5.5 → "Pre-computed token type dispatch"`

`Parser.consume()` and `Parser.match()` currently hash a string on every call.
`ParseletRegistry` already has integer-keyed maps (`prefixById`, `infixById`).
Wire `token.typeId` through `consume()` / `match()` for integer comparison:

```ts
consume(expectedType: string): Token {
  const expectedId = tokenTypeId(expectedType); // Map.get — V8 IC monomorphizes
  if (token.typeId !== expectedId) {
    throw ErrorFactory.parsing(...); // slow path
  }
}
```

**Acceptance:** Parser dispatch tests pass. No parselet files modified. Typecheck clean.

---

### P3.4 — Operator-specific VM opcodes (ADD_NUM, SUB_NUM, MUL_NUM)

**Ref:** `MASTER_PLAN.md → §5.5 → "Operator fast paths"`

When both operands are plain `Number` type at parse time (heuristic: the parser can tag binary ops
that follow two NUMBER tokens with a specialised opcode), the VM can skip all type dispatch:

```ts
case OpCode.ADD_NUM: {
  const b = stack.pop()!.value as number;
  const a = stack.pop()!.value as number;
  stack.push(numberValue(a + b)); // no binaryOp(), no type checks
  break;
}
```

The existing binaryOp numeric fast path already handles the runtime check; this pushes the check
to compile time to save even the fast-path branch.

**Acceptance:** VM benchmarks for `simple_arithmetic` improve by ≥5%. UoM/BigInt/Vector tests unaffected.

---

### P3.5 — Single-pass parse → compile (deferred, highest complexity)

**Ref:** `MASTER_PLAN.md → §5.5 → "Single-pass parse → compile"`

Merge `Parser.parseExpression()` and `BytecodeBuilder.build()` into one pass. Currently parselets
emit opcodes during parsing, but the builder does a separate compaction pass. True single-pass
would eliminate that pass and the intermediate array entirely.

**⚠️ High-risk.** Requires coordinating changes across Parser, BytecodeBuilder, and all 15+
parselet files. Do not attempt until P3.1–P3.4 are complete and benchmarks confirm the remaining
gain is worth the complexity.

---

## P4 — npm Package Extraction (Phase 7 from MASTER_PLAN)

> **Prerequisite:** P0 and P2 items complete. P3 optional — can extract before or after.

### P4.1 — Create `src/solve-js/package.json`

Fields needed:
```json
{
  "name": "@liam/solve-js",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "engines": { "node": ">=18" }
}
```

### P4.2 — Replace path aliases with proper relative imports

`@solve-js/*` path aliases only work inside the monorepo (tsconfig paths). External consumers
need real imports. Replace every `@solve-js/` import in `src/solve-js/src/` with relative paths.
`@app/` imports must not exist in `src/solve-js/src/` (check that `grep -r "@app/" src/solve-js/src/`
returns nothing — it should already be clean).

### P4.3 — Bundle eval worker within the package

The compilation worker (`compilation-worker.ts`) and eval worker (`eval-worker.ts`) must be
bundled as part of the package output so external consumers don't need to configure their own
bundler for Worker support.

### P4.4 — Validate zero cross-boundary imports

```bash
grep -r "from.*src/app" src/solve-js/src/
# Must return nothing
```

### P4.5 — Write public API documentation

`src/solve-js/src/api/SolveAPI.ts` is the public surface. Add JSDoc to every exported type and
function. Write a `README.md` at `src/solve-js/` covering: installation, basic usage, custom
providers, worker setup.

### P4.6 — Test external consumption

Create a minimal `playground/npm-consumer/` directory with its own `package.json` that imports
from the built `solve-js` package. Run `evaluateLine('1 + 1')` and verify it returns `2`.

---

## P5 — CI Benchmark Regression Detection (Phase 6.2 from MASTER_PLAN)

**Ref:** `MASTER_PLAN.md → Phase 6 → "Benchmark regression detection in CI"`

Add `check-benchmark-regression.mjs` at project root:
- Reads `benchmarks/results/full-pipeline-throughput-baseline.json`
- Runs Jest benchmark with `--json --outputFile=benchmarks/results/current.json`
- Compares each tier (small/medium/large, cold/warm) against stored 95% CI upper bounds
- Exits with code 1 if any tier exceeds its bound
- Skips the `massive` tier in CI mode (`CI=true` env var) to stay under 30s

Wire into `.github/workflows/` as a pre-release check.

**Baseline bounds (from current MASTER_PLAN):**
| Tier | Cold bound | Warm bound |
|------|-----------|-----------|
| small | 1.81 ms | 0.33 ms |
| medium | 6.23 ms | 3.21 ms |
| large | 50.14 ms | 43.14 ms |
| Total pipeline | 13.42 µs | — |

---

## Context for the agent: what is already done

Read these sections of `MASTER_PLAN.md` to understand what **not** to redo:

- **§1.1 VM Hot Loop** — ✅ done (`toNumber()` cache, numeric fast path, trace guard, stack inlining)
- **§1.2 Document Engine** — ✅ done (all 8 phases: SegmentTree, ThreeTier, Checkpoints, Viewport, applyTransaction, PageManager, Worker)
- **§1.3 Lexer (moo → custom)** — ✅ done (monomorphic Token, L0/L1/L2, scanDocument, PhraseMatcher, TokenLookup)
- **§1.4 Variable Chain Re-evaluation** — ✅ done (Kahn's algorithm, topological sort)
- **§2.1 Eliminate `any` types** — ✅ done (~37 instances removed)
- **§2.3 Error handling** — ✅ done (29+ `throw new Error()` → `ErrorFactory`)
- **§3.1 Worker consolidation** — ✅ done (single `eval-worker.ts`)
- **§3.2 Cache consolidation** — ✅ done (MemoCache deleted, LineCache simplified)
- **§5.3 Value Arena** — ✅ done (512 pre-allocated Values, enable/disable per evaluation frame)

---

## Quick orientation: where things live

| Concern | File |
|---|---|
| Pipeline entry point | `src/app/codemirror/MarkdownEditorViewPlugin.ts` |
| Three-tier orchestration | `src/solve-js/src/engine/ThreeTierEvaluator.ts` |
| Document state + SegmentTree | `src/solve-js/src/engine/DocumentModel.ts` |
| Full expression pipeline | `src/solve-js/src/engine/ExpressionEngine.ts` |
| Safety checks | `src/solve-js/src/engine/ExpressionEngineSafety.ts` |
| Lexer (custom, moo-free) | `src/solve-js/src/lexer/Lexer.ts` |
| Token keyword registration | `src/solve-js/src/lexer/tokenRegistration.ts` |
| VM execution | `src/solve-js/src/vm/VM.ts` |
| VM builtins | `src/solve-js/src/vm/VMBuiltins.ts` |
| UoM + type coercion | `src/solve-js/src/vm/VMConversion.ts` |
| Bytecode builder | `src/solve-js/src/parser/BytecodeBuilder.ts` |
| Parser (Pratt) | `src/solve-js/src/parser/Parser.ts` |
| Providers | `src/solve-js/src/providers/` |
| Error types | `src/solve-js/src/errors/UnifiedErrorFramework.ts` |
| Configuration | `src/solve-js/src/constants/Configuration.ts` |
| Benchmarks | `src/solve-js/benchmarks/` |
| Benchmark results | `benchmarks/results/` |

---

## How to run things

```bash
# All tests
npx jest

# Specific suite
npx jest "DocumentModel"

# Benchmarks only
npx jest "benchmarks"

# Typecheck
npx tsc --noEmit

# Build plugin
npm run build
```

---

*Last updated: 2026-05-29. Derived from full architecture + code audit by Claude Sonnet 4.6.*
