# Playground Pipeline Gap Analysis

> **Date:** 2026-06-01
> **Scope:** Engine pipeline stages vs. playground visualization coverage

---

## Current Playground Pipeline Visualization (8 Stages)

| Step | Stage | What It Shows |
|------|-------|---------------|
| 1 | **Lexer** | Token chips (up to 8) |
| 2 | **Validation** | Passed/Failed text |
| 3 | **Cache Check** | Hit/Miss text |
| 4 | **Parser** | Parselet names |
| 5 | **Compiler** | Opcode table |
| 6 | **Async Preflight** | Sync/Pending text |
| 7 | **VM Execute** | Result type |
| 8 | **Result** | Final value |

### Current Playground Tabs

| Tab | Data Source | Coverage |
|-----|-------------|----------|
| **Output** | `currentResult.rawTokens` + `lineResults` | Good |
| **Pipeline** | `currentResult` with manual stage extraction | Partial (8 stages, many missing) |
| **Bytecode** | `currentResult.opcodes` + `constants` + `variables` | Good |
| **VM Trace** | `currentResult.vmTrace` | Good |
| **Perf** | `currentResult.stats` + `lineStats` | Good |
| **Workers** | Engine + DQ worker telemetry | Partial (missing compilation worker) |
| **Cache** | `cacheSnapshot` (bytecode + line + async) | Good (but missing page eviction) |
| **Stream** | `diagnosticEvents` + live async events | Good |

---

## Actual Engine Pipeline

From `ExpressionEngine.evaluateExpressionWithDiagnostic()` (the full diagnostic path):

```
PipelineStart
  → Safety Check 1: Expression Length (checkExpressionLength)
  → Lexer Stage (resetExpression → tokenize)
    → TokenEmitted events (per token)
  → Safety Check 2: Complexity Scoring (checkExpressionComplexity)
  → Extract Reads & Writes from tokens (extractReadsAndWrites)
  → Bytecode Cache Check
    → CacheHit / CacheMiss event
  → Parser Stage (parseExpression via PrecedenceParser)
    → ParseletMatched events (per parselet)
  → Bytecode Builder (BytecodeBuilder.build())
    → BytecodeBuilt event
  → Async Preflight (resolverRegistry.preflightAll — O(1) guard)
  → VM Execution (executeBytecode)
    → VmStep events (per opcode, when tracing)
    → VmHalt event
  → DAG Registration + LineCache Storage
  → Pipeline End event
  → Telemetry / Diagnostic Report
```

---

## 🔴 Gap 1: Missing "Line Classification" Stage (Pre-Lexer)

**What the engine does:** Before tokenization, `ExpressionLexer.classifyFromPositions()` classifies each line as one of: `expression`, `prose`, `heading`, `blockquote`, `list`, `code_fence`, `math_fence`, `table`, `table_separator`, `hr`, `wikilink`, `comment`, or `empty`. Skipped lines never reach the lexer.

**Why it matters:** The playground treats every line as an expression. But real documents have headings, blockquotes, lists — all skipped. There's no visual feedback showing *why* a line was skipped.

**Suggested fix:** Add a "Line Classification" step before Lexer showing the classified type and whether the line was skipped.

---

## 🔴 Gap 2: Safety Checks Should Be Split Into Sub-Stages

**What the engine does:** Two distinct safety checks:
1. `checkExpressionLength()` — maximum character count (configurable, default ~1000)
2. `checkExpressionComplexity()` — scoring: `tokens.length + functionCalls × 5 + maxNestingDepth × 10`

**Current playground:** Shows a single "Validation" stage with just "Passed" or "Failed".

**Suggested fix:** Split Validation into two sub-stages or add detail showing the expression length vs limit, complexity score vs max, and individual components (token count, function calls, nesting depth).

---

## 🔴 Gap 3: Missing "Read/Write Extraction" Stage

**What the engine does:** After tokenization, `extractReadsAndWrites()` scans tokens to identify variable reads and writes. This data feeds the DAG for incremental re-evaluation.

**Current playground:** Reads/writes only appear indirectly in the Line Cache tab's entry metadata.

**Suggested fix:** Add a "Variable Tracking" stage between Lexer and Cache showing which variables were read/written.

---

## 🔴 Gap 4: Missing "Dependency Graph" Tab

**What the engine has:** `DependencyGraph` with:
- `registerLine()` — line → (reads[], writes[])
- `getAffectedLinesInOrder()` — topological sort for incremental re-evaluation
- `getAffectedLinesByDataSource()` — for async resolution
- `registerLineDataSourceDependency()` — for external data sources
- `getAffectedLines()` — all downstream consumers of a variable

**Suggested fix:** Add a "DAG" tab with:
- Interactive directed graph of variable dependencies
- Topological order display
- Data source dependencies

---

## 🔴 Gap 5: Missing "Three-Tier Evaluation" Visibility

**What the engine has:** `ThreeTierEvaluator` assigns each line to:
- **Tier 1:** Full pipeline (lex → parse → compile → execute) — visible + dirty
- **Tier 2:** Execute from cached bytecode — visible + cached
- **Tier 3:** Compile-only for dependency tracking — invisible + dirty
- **Skipped:** Clean, empty, or non-evaluable

**Suggested fix:** Add per-line tier indicator and aggregate tier counts in the Pipeline tab.

---

## 🔴 Gap 6: Missing "VM Checkpointer" Visualization

**What the engine has:** `VMCheckpointer` with:
- `snapshot()` — capture VM state after variable definition
- `restoreTo()` — restore VM to nearest checkpoint before a given line
- Prototypal chain of snapshots for O(1) restoration
- Used by `ThreeTierEvaluator.setViewport()` for O(visible lines) scrolling

**Suggested fix:** Show checkpoint locations, restore targets, and chain depth.

---

## 🔴 Gap 7: Missing "Async Resolution Batcher" Details

**What the engine has:** `AsyncResolutionBatcher` with:
- Micro-batching collapses multiple resolution completions into one DAG walk
- Deduplication by (packageId, queryKey)
- Kahn's algorithm for topological sort
- Worker pool offloading for >50 affected lines

**Suggested fix:** Show pending entries queue, dedup stats, affected line counts, topo sort order, and worker offload events.

---

## 🔴 Gap 8: Missing "Compilation Worker" Tab

**What the engine has:** `CompilationWorkerManager` with:
- Background compilation via Web Worker
- `Transferable` bytecode (zero-copy ArrayBuffers)
- Safety validation via `compiledAgainstHash` comparison

**Suggested fix:** Add compilation worker section showing active compilations, pending items, transferred bytecode size, and stored/discarded counts.

---

## 🔴 Gap 9: Missing "Page Manager / Cache Eviction" Visualization

**What the engine has:** `PageManager` (Phase 5.2g):
- Page-based LRU eviction (128 lines/page)
- Three temperature tiers: Hot (viewport ±3 pages), Warm (±6), Cold (beyond)
- Variable def bytecode is **never evicted**
- Directional preloading (next 1–2 pages pre-compiled)

**Suggested fix:** Show page heatmap with Hot/Warm/Cold ranges, eviction events, and preload targets.

---

## 🟡 Gap 10: Missing "Value Arena" Statistics

**What the engine has:** `ValueArena` bump-allocator for zero-allocation Value reuse during Tier 2 scroll execution. Only active during `ThreeTierEvaluator` evaluation.

**Suggested fix:** Show arena utilization (usage/capacity), active status, and allocation savings in the Perf tab.

---

## 🟡 Gap 11: Token Classification Detail Not Shown

**What the engine has:** `TokenClassRegistry` with keyword→token-type mappings (locale + provider + plugin), phrase trie for multi-word matching, and unit name matching.

**Suggested fix:** Show which keywords/phrases/units were matched per identifier, and from which provider (locale, built-in, plugin).

---

## 🟡 Gap 12: Bytecode Cache Details Missing

**What the engine has:** `Map<string, BytecodeProgram>` per-engine. Cache hit/miss events emitted.

**Current playground:** Just shows "Hit" or "Miss" text.

**Suggested fix:** Show cache size, hit ratio for session, and optionally list cached expressions.

---

## 🟡 Gap 13: Formatting Step Not Visible

**What the engine has:** `FormatEngine.formatValue()` converts a Value to display string (handles units, percentages, pending, etc.).

**Suggested fix:** Show raw Value before formatting alongside the formatted string in the Result stage.

---

## 🟢 Gap 14: Inline Solve Detection Not Visualized

**What the engine has:** `findInlineSolves()` detects `s\`...\`` patterns. `evaluateLineWithDebug()` handles them specially.

**Suggested fix:** Show inline solve positions in the Editor or Output tab.

---

## 🟢 Gap 15: No Parselet Registry Introspection

**What the engine has:** `ParseletRegistry` with registered prefix/infix parselets from all packages.

**Suggested fix:** Add a page showing all registered parselets, their token types, binding powers, and priority order.

---

## Summary Table

| # | Gap | Priority | Effort | Key Files to Modify |
|---|-----|----------|--------|---------------------|
| 1 | Line Classification stage | 🔴 High | Small | `PipelineTab.vue`, `PipelineStage.vue`, `engine.ts`, `engine.worker.ts` |
| 2 | Split Safety Checks | 🔴 High | Small | `PipelineTab.vue`, `engine.ts` |
| 3 | Read/Write Extraction stage | 🔴 High | Small | `PipelineTab.vue`, `engine.ts` |
| 4 | DAG Visualization tab | 🔴 High | Large | New `DagTab.vue`, `DagGraph.vue` components |
| 5 | Three-Tier Evaluation indicator | 🔴 High | Medium | `PipelineTab.vue`, `engine.ts` |
| 6 | VM Checkpointer visualization | 🔴 High | Medium | New checkpoint panel in `VmTraceTab.vue` |
| 7 | Async Resolution Batcher details | 🔴 High | Medium | New batcher panel in `StreamTab.vue` or separate |
| 8 | Compilation Worker tab | 🔴 High | Medium | New section in `WorkersTab.vue` |
| 9 | Page Manager / Cache Eviction | 🔴 High | Large | New cache eviction panel in `CacheTab.vue` |
| 10 | Value Arena statistics | 🟡 Medium | Small | New section in `PerfTab.vue` |
| 11 | Token Classification detail | 🟡 Medium | Small | `PipelineTab.vue` lexer stage expansion |
| 12 | Bytecode Cache details | 🟡 Medium | Small | `PipelineTab.vue` cache stage expansion |
| 13 | Formatting step | 🟡 Medium | Small | `PipelineTab.vue` result stage expansion |
| 14 | Inline Solve visualization | 🟢 Low | Medium | `EditorPane.vue`, `OutputTab.vue` |
| 15 | Parselet Registry introspection | 🟢 Low | Medium | New settings/debug page |

---

## Regarding "Normalization" Stage

There is **no standalone normalization stage** in the engine pipeline. The closest concepts are:

1. **Phrase matching** in the lexer (`to the power of` → CARET token) — happens *during* tokenization
2. **TokenClassRegistry** / `tokenRegistration.ts` — keyword→token-type mapping built at lexer construction, not runtime
3. **PrecedenceParser number normalization** — locale-aware separator handling during parsing

If a "Domain Token Fusion" stage is desired, it would need to be built as a post-lexer, pre-parser pass that merges domain-specific token sequences.
