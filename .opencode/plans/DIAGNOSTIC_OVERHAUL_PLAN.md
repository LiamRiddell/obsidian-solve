# Diagnostic Execution Mode Overhaul Plan

> **Context**: The nanosecond ethos demands that diagnostic information be gathered *during* pipeline execution without impacting production-mode performance. The current `getParsletTypeForToken` approach is a hardcoded, non-scalable if/else chain that couples every token type to a parselet category manually. This plan overhauls the entire diagnostic subsystem.

---

## 1. Current State — What's Broken

### 1.1 `getParsletTypeForToken` (ExpressionEngine.ts:393-406)

```typescript
private getParseletTypeForToken(tokenType: string): string {
    if (tokenType === 'PERCENT') return 'Percentage';
    if (tokenType === 'UNIT') return 'UoM';
    // ... 10 more hardcoded if/else branches
    return 'Expression';
}
```

Problems:
- **Not scalable**: Every new provider (8 today, potentially dozens) requires a manual entry
- **Fragile**: Token type strings are used as keys — a rename breaks the mapping silently
- **Wrong abstraction**: Token types don't map 1:1 to parselet categories (e.g., `INCREASE_BY` → `'Percentage'` is a semantic leap)
- **No extensibility**: Plugin parselets can't declare their own diagnostic category

### 1.2 `collectParseletInfo` iterates tokens redundantly

The method (ExpressionEngine.ts:378-388) iterates over already-collected tokens to look up parselet types. This is a second pass that produces data the parser already *has* during its first pass.

### 1.3 `any` types pervade diagnostic output

```typescript
export interface DebugInfo {
    tokens: any[];          // what fields? unknown shape
    parselets: ParseletInfo[];
    program: any;           // BytecodeProgram but untyped
    lineNumber?: number;
    timestamp?: number;
    cacheHit?: boolean;
}
```

### 1.4 `parseDocument()` returns zero diagnostics

Only `evaluateLineWithDebug()` returns debug info. The bulk document path (`parseDocument`) drops it silently. The test file even notes this:
> `// Note: parseDocument doesn't currently return debug info`

### 1.5 No pipeline event hooks

There is no mechanism for a `DiagnosticCollector` to observe pipeline stages (lex, parse, compile, execute). All diagnostic logic is hardcoded inline in `ExpressionEngine`.

---

## 2. Target Architecture

```
┌──────────────────────────────────────────────────┐
│              ExpressionEngine                     │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Lexer   │→ │  Parser  │→ │Compiler  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │             │
│       ▼              ▼              ▼             │
│  ┌─────────────────────────────────────────┐     │
│  │       DiagnosticPipeline (event bus)    │     │
│  │  - DiagnosticCollector interface        │     │
│  │  - Zero-cost when disabled (empty impl) │     │
│  └─────────────────────────────────────────┘     │
│                      │                            │
│                      ▼                            │
│  ┌─────────────────────────────────────────┐     │
│  │         VM Execution                    │     │
│  │  - Per-instruction trace (opt-in)       │     │
│  └─────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

**Key principle**: `DiagnosticPipeline` is a concrete object that gets injected into each stage. When no collectors are registered, it is a no-op stub — zero branching, zero allocation, zero overhead.

---

## 3. Implementation Plan

### Phase A: Diagnostic Event Model (2-3h)

**Goal**: Replace all `any` types and string-based categorization with a typed event model.

| Step | Action | File |
|------|--------|------|
| A1 | Define `DiagnosticEvent` discriminated union with variants: `TokenEmitted`, `ParseletMatched`, `BytecodeEmitted`, `VmStep`, `VmHalt`, `CacheHit`, `CacheMiss` | New: `src/diagnostics/events.ts` |
| A2 | Replace `ParseletInfo` with a proper interface: `{ tokenType: TokenType; tokenValue: string; parseletCategory: string; parseletType: string; bindingPower?: number; offset: number }` | `src/types/ParsingResult.ts` |
| A3 | Replace `DebugInfo` with `DiagnosticReport { events: DiagnosticEvent[]; summary: DiagnosticSummary; metadata: DiagnosticMetadata }` | `src/types/ParsingResult.ts` |
| A4 | Add `category` property to `PrefixParselet` and `InfixParselet` interfaces | `src/parser/Parselet.ts` |
| A5 | Every existing parselet declares its own category (e.g., `static category = 'Arithmetic'` on the class) | All parselet files |

**Parselet.ts changes**:
```typescript
export interface PrefixParselet {
    readonly category: string;  // e.g., "Arithmetic", "Function", "Variable"
    parse(parser: Parser, token: Token, builder: BytecodeBuilder): void;
}

export interface InfixParselet {
    readonly category: string;
    parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void;
    getBindingPower(): number;
}
```

This **eliminates `getParsletTypeForToken` entirely** — the category comes from the parselet itself, not from a lookup table.

### Phase B: DiagnosticPipeline and Collector Interface (2-3h)

**Goal**: Decouple diagnostic collection from ExpressionEngine logic.

| Step | Action | File |
|------|--------|------|
| B1 | Define `DiagnosticCollector` interface with methods: `onTokenEmitted(token)`, `onParseletMatched(parselet, token)`, `onBytecodeEmitted(program)`, `onVmStep(opcode, ip, stackDepth)`, `onVmHalt(result)`, `onCacheHit(key)`, `getReport(): DiagnosticReport` | New: `src/diagnostics/collector.ts` |
| B2 | Create `NullDiagnosticCollector` — every method is a no-op. Zero branching, zero storage. | New: `src/diagnostics/null-collector.ts` |
| B3 | Create `TimelineCollector` — implements `DiagnosticCollector`, records events with `performance.now()` timestamps | New: `src/diagnostics/timeline-collector.ts` |
| B4 | Create `DiagnosticPipeline` class: holds a list of `DiagnosticCollector[]`. Dispatches events to all collectors. When empty (production mode), the compiler can inline/eliminate calls. | New: `src/diagnostics/pipeline.ts` |
| B5 | Add `diagnosticPipeline: DiagnosticPipeline` to `ExpressionEngine` constructor. Replace the `boolean diagnosticMode` flag. | `src/engine/ExpressionEngine.ts` |

**Performance guarantee**: In production, `ExpressionEngine` is constructed with an empty pipeline. The JIT will inline the dispatch method and eliminate it entirely. No `if (this.diagnosticMode)` branches remain.

### Phase C: Eliminate `any` Types in Diagnostic Output (1-2h)

| Step | Action | File |
|------|--------|------|
| C1 | Type the `tokens` field as `Token[]` (already typed, the `any[]` in `evaluateExpressionWithDiagnostic` is the problem) | `ExpressionEngine.ts` |
| C2 | Type the `program` field as `BytecodeProgram` everywhere | `ExpressionEngine.ts`, `ParsingResult.ts` |
| C3 | Type the `DebugInfo` replacement (`DiagnosticReport`) with strict interfaces | `src/types/ParsingResult.ts` |

### Phase D: Pipeline-Level Diagnostic Instrumentation (3-4h)

**Goal**: Gather data at every pipeline stage, not just post-parse.

| Step | Action | Details |
|------|--------|---------|
| D1 | **Lexer instrumentation**: After each token is emitted, call `pipeline.onTokenEmitted(token)` | `Lexer.ts`, `ExpressionLexer.ts` |
| D2 | **Parser instrumentation**: When a parselet is matched (prefix or infix), call `pipeline.onParseletMatched(parselet, token)` — replaces `collectParseletInfo()` entirely | `Parser.ts` |
| D3 | **Compiler instrumentation**: After `build()`/`buildInto()`, call `pipeline.onBytecodeEmitted(program)` | `BytecodeBuilder.ts` |
| D4 | **VM trace mode** (opt-in flag): After each opcode execution, call `pipeline.onVmStep(opcode, ip, stackDepth)`. Requires a `diagnosticConfig.vmTrace` option in `EngineConfig`. | `VM.ts`, `Configuration.ts` |
| D5 | **Cache instrumentation**: Log cache hits/misses in the bytecode and line caches | `ExpressionEngine.ts` |
| F6 | Remove `parseDocumentLean()` — it's now unnecessary since the pipeline has zero overhead in production | `ExpressionEngine.ts` |

### Phase E: Propagate Diagnostics Through `parseDocument` (1-2h)

| Step | Action |
|------|--------|
| E1 | Change `ParsingResult` to include per-line `DiagnosticReport` (or aggregate) |
| E2 | Thread the `DiagnosticPipeline` through `parseDocument()` → `evaluateLineWithDebug()` → `evaluateExpressionWithDiagnostic()` |
| E3 | Ensure inline solve diagnostics are captured within the parent line's report |
| E4 | Update `parseDocument()` return type to include `diagnostics: DiagnosticReport` alongside `lines`, `totalLines`, `errors` |

### Phase F: Tests and Validation (2-3h)

| Test | Description |
|------|-------------|
| F1 | `DiagnosticMode.spec.ts` — replace old tests: verify `NullDiagnosticCollector` has zero overhead |
| F2 | Timeline collector test: verify timestamps are monotonically increasing |
| F3 | Parselet self-category test: every registered parselet has a non-empty `category` |
| F4 | `parseDocument` diagnostic test: verify diagnostics are returned for full documents |
| F5 | Pipeline removal regression test: same results with and without pipeline |
| F6 | VM trace test: verify per-opcode trace completeness for a simple expression |
| F7 | Benchmark: production throughput unchanged (or improved) with empty pipeline |

---

## 4. Files to Modify

| File | Change |
|------|--------|
| `src/solve-js/src/engine/ExpressionEngine.ts` | Remove `diagnosticMode` boolean, add `DiagnosticPipeline`, remove `getParsletTypeForToken`, remove `collectParseletInfo`, remove `parseDocumentLean`, update `evaluateExpressionWithDiagnostic` to dispatch events |
| `src/solve-js/src/lexer/Lexer.ts` | Accept optional `DiagnosticPipeline`, emit `onTokenEmitted` during iteration |
| `src/solve-js/src/lexer/ExpressionLexer.ts` | Pass pipeline through to inner lexer |
| `src/solve-js/src/parser/Parser.ts` | Accept optional `DiagnosticPipeline`, emit `onParseletMatched` when parselets are resolved |
| `src/solve-js/src/parser/Parselet.ts` | Add `category` field to both `PrefixParselet` and `InfixParselet` interfaces |
| `src/solve-js/src/parser/BytecodeBuilder.ts` | Accept optional `DiagnosticPipeline`, emit `onBytecodeEmitted` in `build()`/`buildInto()` |
| `src/solve-js/src/vm/VM.ts` | Accept optional `DiagnosticPipeline` (via `createVM`), emit `onVmStep` when trace mode enabled |
| `src/solve-js/src/types/ParsingResult.ts` | Overhaul `DebugInfo` → `DiagnosticReport`, `ParseletInfo` → typed variant |
| `src/solve-js/src/constants/Configuration.ts` | Add `diagnosticConfig: { enabled: boolean, vmTrace: boolean }` to `EngineConfig` |
| `src/solve-js/src/cache/LineCache.ts` | Add cache hit/miss instrumentation callback |

## 5. Files to Create

| File | Purpose |
|------|---------|
| `src/solve-js/src/diagnostics/events.ts` | Typed diagnostic event definitions |
| `src/solve-js/src/diagnostics/collector.ts` | `DiagnosticCollector` interface |
| `src/solve-js/src/diagnostics/null-collector.ts` | No-op implementation |
| `src/solve-js/src/diagnostics/timeline-collector.ts` | Timestamped event collector |
| `src/solve-js/src/diagnostics/pipeline.ts` | `DiagnosticPipeline` class |
| `src/solve-js/src/diagnostics/index.ts` | Barrel export |

---

## 6. Backwards Compatibility

| Concern | Mitigation |
|---------|------------|
| `diagnosticMode: boolean` constructor param | Keep as second param for simplicity; internally create pipeline with default `TimelineCollector` when `true`, `NullDiagnosticCollector` when `false` |
| `DebugInfo` type in public API | Export `DiagnosticReport` as the replacement; `DebugInfo` deprecated alias maps to it |
| `parseDocumentLean()` | Keep as a deprecated passthrough to `parseDocument()` with a console warning |
| Parselet `category` required | All built-in parselets updated; plugin parselets get a default `"Plugin"` category if omitted |

---

## 7. Estimated Effort: 12-18 hours

| Phase | Hours | Dependencies |
|-------|-------|-------------|
| A: Event Model | 2-3h | None |
| B: Pipeline + Collectors | 2-3h | A |
| C: Eliminate `any` types | 1-2h | A |
| D: Instrument all stages | 3-4h | A, B |
| E: Propagate through parseDocument | 1-2h | A, B, D |
| F: Tests + benchmarks | 2-3h | All above |

**Priority**: After Phase 0 baseline benchmarks are captured (PLAN_09). Before Phase 5 micro-optimizations, since this eliminates the remaining `diagnosticMode` branching overhead identified in GAP-F6.

---

## 8. Success Criteria

1. `getParsletTypeForToken()` is deleted — parselets self-declare their category
2. `parseDocument()` returns full diagnostic data, not just a subset
3. All `any` types in the diagnostic path are replaced with proper interfaces
4. Production mode (`NullDiagnosticCollector`) has **zero measurable overhead** vs current `diagnosticMode = false`
5. No existing test breaks after the refactor
6. VM trace mode captures complete per-opcode execution traces for debugging complex expressions