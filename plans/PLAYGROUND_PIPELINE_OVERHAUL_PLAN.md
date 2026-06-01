# Playground Pipeline Overhaul: Implementation Plan

> **Status:** Awaiting approval
> **Date:** 2026-06-01

---

## 1. Core Insight: The Diagnostic Data Contract

The current problem is that the playground reconstructs pipeline data from raw diagnostic **events** — it pieces together token emissions, parselet matches, cache hits, etc. into a debug view. This is fragile, error-prone, and incomplete.

**The solution:** When `diagnosticMode = true`, the engine produces a structured `DiagnosticPipelineResult` that contains every stage's output as typed data. The playground simply renders it — no reconstruction, no guesswork.

```typescript
// Proposed data contract (returned by evaluateLineWithDebug when diagnosticMode=true)

interface DiagnosticPipelineResult {
  /** Ordered per-stage results — playground renders in sequence */
  stages: PipelineStageResult[];
  /** Raw tokens from lexer */
  tokens: Token[];
  /** Compiled bytecode */
  program: BytecodeProgram;
  /** Evaluation value */
  value: Value;
  /** All existing fields preserved */
  errors: string[];
  opcodes: OpcodeInfo[];
  constants: ConstantInfo[];
  variables: string[];
  stats: PerformanceStats;
  lineResults: LineResult[];
  parselets: ParseletInfo[];
  vmTrace: VmTraceStep[];
  cacheSnapshot: CacheSnapshot;
  diagnosticEvents: DiagnosticEventInfo[];
  /** NEW: optional error */
  error?: string;
  /** NEW: inline solve position */
  inlineSolve?: InlineSolvePosition;
}

interface PipelineStageResult {
  /** Stage identifier: 'line_classification', 'safety_length', 'lexer', 'normalizer', etc. */
  stage: string;
  /** Display label for the playground */
  label: string;
  /** Icon emoji */
  icon: string;
  /** Color class for UI */
  colorClass: string;
  /** Elapsed nanoseconds from pipeline start */
  elapsedNs: number;
  /** Whether this stage was skipped (cache hit, empty tokens, etc.) */
  skipped: boolean;
  /** Stage-specific typed output */
  output: StageOutput;
}

type StageOutput =
  | LineClassificationOutput
  | SafetyLengthOutput
  | LexerOutput
  | NormalizerOutput
  | SafetyComplexityOutput
  | ReadWriteOutput
  | CacheCheckOutput
  | ParserOutput
  | CompilerOutput
  | AsyncPreflightOutput
  | VmExecuteOutput
  | DagRegistrationOutput
  | ResultOutput;
```

---

## 2. The New Pipeline (with Normalizer)

```
1.  PipelineStart
2.  Line Classification    (classifyFromPositions → type + skip)
3.  Safety: Length         (checkExpressionLength → score vs limit)
4.  Lexer                  (resetExpression → raw tokens)
5.  Normalizer             (NEW: domain token fusion — phrases, item names, etc.)
6.  Safety: Complexity     (checkExpressionComplexity → score vs limit)
7.  Read/Write Extraction  (extractReadsAndWrites → variables found)
8.  Cache Check            (bytecode cache hit/miss)
9.  Parser                 (Pratt parse → parselets matched)
10. Compiler               (BytecodeBuilder → opcode table)
11. Async Preflight        (resolverRegistry scan → sync/pending path)
12. VM Execute             (stack machine → result + vm trace)
13. DAG Registration       (register in dependency graph)
14. LineCache Storage      (store result + bytecode)
15. PipelineEnd            (final totals)
16. Telemetry              (per-stage allocations + timings)
```

The playground renders all 16 stages in order. Stages 2–4 are pre-safety; stages 5+ are the evaluation pipeline. When a stage is skipped (e.g., line isn't an expression), it shows as greyed out with the reason.

---

## 3. The Normalizer Stage (NEW — Gap 0)

### 3.1 Architecture

The normalizer sits between the Lexer and Safety Stage 2. It receives raw tokens and produces normalized tokens. Domain-specific rules are registered by providers/plugins.

```
Raw Tokens (from Lexer)
     │
     ▼
┌─────────────────────────────────┐
│         TokenNormalizer         │
│                                 │
│  ┌─ Rule: PhraseFusion ──────┐ │
│  │ "abyssal" "whip" →        │ │
│  │   ITEM("abyssal whip")    │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌─ Rule: MultiWordUnit ─────┐ │
│  │ "square" "meters" →       │ │
│  │   UNIT("m²")              │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌─ Rule: PrefixUnit ────────┐ │
│  │ "$" NUMBER →              │ │
│  │   UOM(NUMBER, "USD")      │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌─ Rule: ImplicitMultiply ──┐ │
│  │ NUMBER IDENT →            │ │
│  │   NUMBER STAR IDENT       │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
     │
     ▼
Normalized Tokens (to Parser)
```

### 3.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Lexer stays slim? | ✅ Yes | Lexer only does character-level tokenization. No phrase trie, no domain logic. |
| Normalizer is pluggable? | ✅ Yes | Providers register `NormalizerRule[]` alongside `Parselet[]` and `OpCode[]` |
| Normalizer runs per-expression? | ✅ Yes | Same scope as lexer — per-evaluation call |
| Normalizer tokens carry source info? | ✅ Yes | Each normalized token has `sourceTokens: Token[]` for traceability |
| Lexer phrase matching removed? | ✅ Yes | All phrase logic moves to normalizer. Lexer only emits IDENT for words. |

### 3.3 Implementation Steps

1. **Create `src/solve-js/src/normalizer/TokenNormalizer.ts`**
   - `NormalizerRule` interface: `{ name, match(tokens, pos) → { consumed, replacement }, priority }`
   - `TokenNormalizer` class: applies rules in priority order, greedy left-to-right
   - Built-in rules: implicit multiplication, negative number detection
   - Provider rules: phrase fusion, item name composition, multi-word units

2. **Create `src/solve-js/src/normalizer/BuiltinNormalizerRules.ts`**
   - `ImplicitMultiplyRule`: `5kg` → `5 * kg`, `3(2+1)` → `3 * (2+1)`
   - `NegativeNumberRule`: `-5` → NEG + 5 (currently handled in parser)
   - `AdjacentStringConcat`: `"hello" "world"` → `"helloworld"`

3. **Create new normalizer events in `diagnostics/events.ts`**
   - `NormalizerStart`: begins normalization pass
   - `TokenFused`: emitted when a rule merges tokens
   - `NormalizerEnd`: ends normalization pass

4. **Modify `ExpressionEngine`**
   - Add `normalizer: TokenNormalizer` field
   - In `evaluateExpressionWithDiagnostic()`, insert normalizer pass between lexer and safety check 2
   - Register provider normalization rules in `registerPackage()`
   - Fire normalizer diagnostic events

5. **Move existing phrase logic OUT of the lexer**
   - Remove `tryMatchPhrase()` from `ExpressionLexer.tokenizeIdentifier()`
   - Remove `phraseTrie`, `phraseStartWords` from ExpressionLexer
   - Remove `PhraseEntry`, `buildPhraseList()` helpers
   - Move phrase definitions to normalizer rules (registered by providers)

6. **Add normalizer output to diagnostic result**
   - `NormalizerOutput`: `{ tokensBefore, tokensAfter, fusions: [{ rule, sourceTokens, fusedToken }] }`



---

## 4. Engine: Diagnostic Data Contract

### 4.1 New `DiagnosticPipelineResult` Type

The engine's `evaluateLineWithDebug()` currently returns:
```typescript
{ value, tokens, program, error?, inlineSolve?, debug? }
```

The `debug` field is a serialized `DiagnosticReportJSON` from the timeline collector. We add a parallel structured result.

**New:** Add `diagnostic?: DiagnosticPipelineResult` to the return type (populated only when `diagnosticMode=true`).

### 4.2 Stage Output Types

```typescript
// Stage 2: Line Classification
interface LineClassificationOutput {
  type: 'stage_output';
  classification: MarkdownLineType; // 'expression' | 'heading' | 'list' | ...
  skip: boolean;
  hasInlineSolve: boolean;
}

// Stage 3: Safety Length
interface SafetyLengthOutput {
  type: 'stage_output';
  passed: boolean;
  expressionLength: number;
  maxLength: number;
}

// Stage 4: Lexer
interface LexerOutput {
  type: 'stage_output';
  tokenCount: number;
  tokens: Token[];  // raw, pre-normalization
  tokenTypes: Record<string, number>; // type → count
  hasParens: boolean;
  locale: string;
}

// Stage 5: Normalizer (NEW)
interface NormalizerOutput {
  type: 'stage_output';
  inputTokens: number;
  outputTokens: number;
  fusions: TokenFusion[];
  rulesApplied: { rule: string; count: number }[];
}

// Stage 6: Safety Complexity
interface SafetyComplexityOutput {
  type: 'stage_output';
  passed: boolean;
  complexityScore: number;
  maxComplexity: number;
  breakdown: {
    tokens: number;
    functionCalls: number;
    nestingDepth: number;
  };
}

// Stage 7: Read/Write Extraction
interface ReadWriteOutput {
  type: 'stage_output';
  reads: string[];
  writes: string[];
  isAssignment: boolean;
}

// Stage 8: Cache Check
interface CacheCheckOutput {
  type: 'stage_output';
  hit: boolean;
  cacheSize: number;
  cacheKey: string;
}

// Stage 9: Parser
interface ParserOutput {
  type: 'stage_output';
  parselets: { type: string; category: string; prefix: boolean }[];
  uniqueParseletTypes: string[];
  astDepth: number;
}

// Stage 10: Compiler
interface CompilerOutput {
  type: 'stage_output';
  opcodeCount: number;
  numberConstants: number;
  stringConstants: number;
  hasAsync: boolean;
  estimatedStackDepth: number;
}

// Stage 11: Async Preflight
interface AsyncPreflightOutput {
  type: 'stage_output';
  path: 'sync' | 'pending';
  pendingQueryKey?: string;
  resolverCount: number;
  skippedGuard: boolean; // O(1) fast-path triggered?
}

// Stage 12: VM Execute
interface VmExecuteOutput {
  type: 'stage_output';
  totalInstructions: number;
  stackDepth: number;
  resultType: string; // 'Number', 'Uom', etc.
  resultValue: string; // formatted
  isPending: boolean;
}

// Stage 13: DAG Registration
interface DagRegistrationOutput {
  type: 'stage_output';
  readsRegistered: string[];
  writesRegistered: string[];
  dataSourcesRegistered: string[];
}

// Stage 14: LineCache
interface LineCacheOutput {
  type: 'stage_output';
  lineNumber: number;
  expression: string;
  stored: boolean;
}

// Stage 15: Result
interface ResultOutput {
  type: 'stage_output';
  rawValue: string;   // before formatting
  formattedValue: string;
  valueType: string;
  unit?: string;
}
```

### 4.3 Performance: Diagnostic Mode Toggle

```
Engine constructor:
  new ExpressionEngine('en', diagnosticMode = false)

When diagnosticMode = false (production):
  - No DiagnosticPipeline created
  - No TimelineDiagnosticCollector
  - No stage output collection
  - No vmTrace recording
  - No per-token events
  - evaluateLineWithDebug() returns: { value, tokens, program }  (minimal)
  - ~0% overhead for pipeline data

When diagnosticMode = true (playground):
  - Full DiagnosticPipeline with TimelineCollector
  - All 16 stages produce output
  - vmTrace per-step recording
  - Token emissions, parselet matches, cache events all fired
  - evaluateLineWithDebug() returns: full DiagnosticPipelineResult
  - ~5-10% overhead (acceptable for debugging)
```

The playground already calls the engine with `diagnosticMode: true`. No changes needed there — we just need the engine to produce richer output when that flag is on.

---

## 5. Gap Implementation Plan (All 16)

### Phase 1: Foundation (Normalizer + Data Contract)
**Effort:** ~4 hours
**Files:** `src/solve-js/src/normalizer/*`, `src/solve-js/src/engine/ExpressionEngine.ts`, `src/solve-js/src/diagnostics/events.ts`

1. ✅ Build `TokenNormalizer` with pluggable rules
2. ✅ Add normalizer to engine pipeline between lexer and safety check
3. ✅ Define full `DiagnosticPipelineResult` type with all stage outputs
4. ✅ Populate all stage outputs in `evaluateExpressionWithDiagnostic()` when diagnosticMode=true
5. ✅ Move phrase matching from lexer to normalizer rules

### Phase 2: Pipeline Tab — All 16 Stages
**Effort:** ~6 hours
**Files:** `playground/src/components/PipelineTab.vue`, `PipelineStage.vue`, `playground/src/engine.ts`

6. Split Validation into two stages (Length + Complexity)
7. Add Line Classification stage (before Lexer)
8. Add Normalizer stage (between Lexer and Safety2)
9. Add Read/Write Extraction stage
10. Add DAG Registration stage
11. Add LineCache Storage stage
12. Update all stage outputs to use new typed data
13. Add collapsible sub-details for each stage

### Phase 3: New Tabs
**Effort:** ~8 hours
**Files:** New `.vue` components, `playground/src/engine.ts`, engine worker

14. **DAG Tab** — dependency graph visualization
    - Show reads→line mapping
    - Show downstream consumers of each variable
    - Highlight affected lines on variable change
    - Interactive graph (simple tree/list view initially, SVG forced graph later)

15. **Three-Tier Indicator** — add to Pipeline tab + Output tab
    - Per-line tier badge (T1/T2/T3/Skip)
    - Aggregate tier counts
    - Tier selection reason (dirty, cached, invisible)

16. **VM Checkpointer** — add to VM Trace tab
    - Checkpoint locations marked in trace
    - Show saved variables per checkpoint
    - Show nearest checkpoint for any line

17. **Batcher Panel** — add to Stream tab
    - Pending entries queue (collapsed by default)
    - Dedup stats
    - Topological sort visualization (ordered line list)
    - Worker offload indicator

18. **Compilation Worker** — expand Workers tab
    - Third worker card for compilation worker
    - Active compilations count
    - Bytecode transfer size
    - Store/discard stats

19. **Page Manager** — add to Cache tab
    - Page heatmap (small colored grid: Hot=red, Warm=yellow, Cold=grey)
    - Eviction log
    - Preload direction indicator

### Phase 4: Enhancements
**Effort:** ~4 hours
**Files:** Various playground components

20. **Value Arena Stats** — add to Perf tab stats grid
21. **Token Classification Detail** — add tooltip to Lexer stage showing keyword/phrase/unit resolution
22. **Bytecode Cache Details** — expand Cache stage with size and hit rate
23. **Formatting Step** — show raw Value + formatted string side by side in Result stage
24. **Inline Solve Visualization** — highlight inline solve regions in editor
25. **Parselet Registry** — new info tab showing all registered parselets with binding powers

---

## 6. Optimized Implementation Strategy

### 6.1 Single Pass, All Data

Instead of making 16 separate calls or events, the engine does ONE pass through the pipeline and populates ALL stage outputs into a single result object. The playground receives this and renders everything.

```typescript
// Engine: one pass, all data
evaluateExpressionWithDiagnostic(expression, lineNumber) {
  const stages: PipelineStageResult[] = [];

  // Stage 1: PipelineStart
  stages.push({ stage: 'pipeline_start', ... });
  
  // Stage 2: Line Classification
  const classification = this.classifyLine(expression);
  stages.push({ stage: 'line_classification', output: classification, ... });
  if (classification.skip) return { ...result, stages }; // early exit for skipped lines

  // Stage 3: Safety Length
  // Stage 4: Lexer
  // Stage 5: Normalizer
  // ... all remaining stages

  return { value, tokens, program, stages, ... };
}
```

### 6.2 Playground: Declarative Rendering

```vue
<!-- PipelineTab.vue -->
<div class="pipeline-flow">
  <PipelineStage
    v-for="stage in stages"
    :key="stage.stage"
    :stage="stage"
  />
</div>
```

Each `PipelineStage` component receives a typed `PipelineStageResult` and renders appropriately based on `stage.output.type`. No more manual HTML string construction or data reconstruction.

### 6.3 Shared Types

Move stage output types to a shared location:
```
src/solve-js/src/types/DiagnosticPipelineResult.ts
```

Both the engine and playground import from here. TypeScript ensures the contract stays consistent.

---

## 7. File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `src/solve-js/src/normalizer/TokenNormalizer.ts` | NEW — Normalizer class | 1 |
| `src/solve-js/src/normalizer/BuiltinNormalizerRules.ts` | NEW — Built-in rules | 1 |
| `src/solve-js/src/normalizer/NormalizerRule.ts` | NEW — Rule interface | 1 |
| `src/solve-js/src/normalizer/index.ts` | NEW — Public exports | 1 |
| `src/solve-js/src/types/DiagnosticPipelineResult.ts` | NEW — Shared types | 1 |
| `src/solve-js/src/diagnostics/events.ts` | Add normalizer events | 1 |
| `src/solve-js/src/diagnostics/pipeline.ts` | Add normalizer dispatchers | 1 |
| `src/solve-js/src/diagnostics/timeline-collector.ts` | Handle normalizer events | 1 |
| `src/solve-js/src/diagnostics/collector.ts` | Add normalizer handlers | 1 |
| `src/solve-js/src/engine/ExpressionEngine.ts` | Wire normalizer, populate stages | 1–2 |
| `src/solve-js/src/lexer/ExpressionLexer.ts` | Remove phrase matching (~150 lines) | 1 |
| `src/solve-js/src/lexer/TokenClassRegistry.ts` | Remove phrase trie (~50 lines) | 1 |
| `src/solve-js/src/providers/builtins.ts` | Move phrase definitions to normalizer rules | 1 |
| `playground/src/engine.ts` | Consume DiagnosticPipelineResult | 2 |
| `playground/src/engine.worker.ts` | Pass through new data | 2 |
| `playground/src/stores/engine.ts` | Store new result type | 2 |
| `playground/src/stores/pipeline.ts` | Add DAG, checkpoint state | 3 |
| `playground/src/components/PipelineTab.vue` | Render 16 declarative stages | 2 |
| `playground/src/components/PipelineStage.vue` | Accept typed stage output | 2 |
| `playground/src/components/DagTab.vue` | NEW — DAG visualization | 3 |
| `playground/src/components/VmTraceTab.vue` | Add checkpoint markers | 3 |
| `playground/src/components/StreamTab.vue` | Add batcher panel | 3 |
| `playground/src/components/WorkersTab.vue` | Add compilation worker card | 3 |
| `playground/src/components/CacheTab.vue` | Add page heatmap + eviction log | 3 |
| `playground/src/components/DiagnosticsPane.vue` | Add DAG tab to tab bar | 3 |
| `playground/src/components/OutputTab.vue` | Add tier badges, inline solve highlights | 4 |
| `playground/src/components/PerfTab.vue` | Add arena stats | 4 |
| `playground/src/main.ts` | Register new tab component | 3 |
| `playground/src/App.vue` | Register new tab globally | 3 |

---

## 8. Acceptance Criteria

1. **Normalizer stage exists** in the pipeline between Lexer and Safety2
2. **Phrase matching removed from lexer** — lexer only emits IDENT for words
3. **All 16 pipeline stages** render in the Pipeline tab
4. **DAG tab exists** and shows variable dependency relationships
5. **Three-tier badges** appear on lines in Output tab
6. **Compilation worker card** appears in Workers tab
7. **Page heatmap** renders in Cache tab
8. **Build passes** with zero TypeScript errors
9. **No performance regression** when diagnosticMode=false
10. **Existing tests pass** (lexer, parser, integration tests)
