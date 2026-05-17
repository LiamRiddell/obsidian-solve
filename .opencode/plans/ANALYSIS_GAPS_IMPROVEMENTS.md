# solve-js — Gap Analysis & Improvement Plan

> Where the project falls short of its goals and what to do about it

---

## 1. Executive Summary

The solve-js engine is a well-architected expression parser with a clean Pratt parser, stack-based bytecode VM, pluggable provider system, and multi-layer caching. However, a thorough review reveals significant gaps across all six goal areas that must be addressed before the library is ready for enterprise production, external consumption as an npm package, and the demanding performance profile required by real-time editor integration.

---

## 2. Goals vs. Reality Matrix

| Goal | Current State | Rating | Key Issues |
|------|--------------|--------|------------|
| **Speed** | Functional but unoptimized | ⚠️ Medium | Re-tokenization on every parse, no bytecode caching across calls, MarkdownLexer recreated per-engine, no memoization of lexer output |
| **Maintainability** | Good structure, poor enforcement | ⚠️ Medium | `any` types throughout, mixed responsibilities in ExpressionEngine, no JSDoc, magic numbers |
| **Flexibility** | Plugin system exists but is disconnected | ⚠️ Medium | Engine constructor hardcodes providers, PluginSystem never wired to engine, `ISolvePackage` doesn't support all extension points |
| **Performance** | N/A — no benchmarks exist | ❌ Low | Zero performance tests, no profiling data, known hot paths unoptimized |
| **Production Readiness** | Partial error handling, partial resilience | ⚠️ Medium | UnifiedErrorFramework exists but is barely used, VM has no stack depth limits, no input sanitization |
| **Enterprise Scalability** | Caching exists but is fragmented | ⚠️ Medium | 3 overlapping cache systems (LineCache, MemoCache, UnifiedCache), no coherent invalidation strategy |

---

## 3. Detailed Gap Analysis

### 3.1 SPEED — Performance Gaps & Optimizations

#### GAP 3.1.1: Repeated Lexer Initialization
**File**: `ExpressionEngine.ts:47`
**Problem**: `new Lexer(localeCode)` is called on every `ExpressionEngine` constructor, which internally creates a full `moo.Lexer` with regex compilation for all states. For document parsing with `parseDocument()`, a new Lexer is also created per call to `evaluateExpressionWithDiagnostic()` (line 224: `this.lexer.reset(expression)`).
**Impact**: Regex compilation is expensive. The moo lexer builds ~20 regex patterns per state, with 7 states = 140+ regex compilations per engine instantiation.
**Fix**:
- Cache the moo lexer instance and reuse across `reset()` calls
- Use a factory/prototype pattern so reset doesn't recompile
- Pre-compile all regexes once at module load time

#### GAP 3.1.2: No Bytecode Caching Across Expressions
**File**: `ExpressionEngine.ts:220-293`
**Problem**: Every call to `evaluateExpressionWithDiagnostic()` re-tokenizes, re-parses, and re-builds bytecode, even for identical expressions. The `lineCache` stores results but doesn't cache bytecode programs for reuse across different ExpressionEngine instances or for repeated expressions on different lines.
**Impact**: `parseDocument()` on a 1000-line document recompiles 1000 bytecodes from scratch.
**Fix**:
- Add a static/program-level bytecode cache keyed by expression hash
- Cache `BytecodeProgram` objects (or the compiled `Uint8Array`/`Float64Array`)
- Invalidate on grammar changes (provider registration)

#### GAP 3.1.3: Lexer Token Allocation Pressure
**File**: `MarkdownLexer.ts`, `ExpressionEngine.ts:225-229`
**Problem**: The iterator pattern (`for (const t of lexer)`) creates an object per token via moo's generator. For a typical expression with 10 tokens, that's 10 heap objects per expression, 10,000 for a 1000-line document.
**Fix**:
- Provide a `tokenizeToArray()` method that pre-allocates an array
- Use object pooling for Token objects
- Consider a simpler regex-based tokenizer for the hot path (moo is powerful but has overhead)

#### GAP 3.1.4: Inefficient Inline Solve Detection
**File**: `ExpressionEngine.ts:155-176`
**Problem**: `findInlineSolvesInLine()` uses regex `/s\`([^`]*)\`/g` which is fine, but strips the backtick markers, then the full MarkdownLexer processes the inner expression. On re-evaluation, the `evaluateLineWithDebug` method re-runs a second regex match (`/^s\`([^`]*)\`$/`) for inline solves (line 197).
**Fix**:
- Eliminate the redundant regex in `evaluateLineWithDebug` — use a flag from the caller
- Process inline solves in a single pass during the initial line scan

#### GAP 3.1.5: Redundant Empty Line Check
**File**: `ExpressionEngine.ts:86, 147-150`
**Problem**: The regex `/^\s*$|^\s*([#>-]|\*|\+)\s*$/` is compiled on every line. While V8 may cache it, it's still running a multi-branch regex for every single line.
**Fix**:
- Pre-compile and store the regex as a static constant
- Consider simpler checks (`lineText.trim().length === 0`) for the common case

#### GAP 3.1.6: Regex-based Backtick Detection is Fragile and Slow
**File**: `ExpressionEngine.ts:157`
**Problem**: The regex `/s`([^`]*)`/g` doesn't handle escaped backticks, nested expressions, or markdown code blocks that look like inline solves. It also can't handle Unicode backtick variants.
**Fix**:
- Use the moo lexer states for proper backtick tracking
- Or at minimum, add a pre-filter for common non-solve patterns

### 3.2 MAINTAINABILITY — Code Quality Issues

#### GAP 3.2.1: Pervasive `any` Types
**Files**: `ExpressionEngine.ts:230`, `DataQueryWorker.ts:104,179`, `DataQueryService.ts:32`, multiple test files
**Problem**: `any` type usage defeats TypeScript's value proposition. In `ExpressionEngine.ts:230`, `containerEl: any` suggests an Obsidian-specific leak into the core engine.
**Count**: At least 15 uses of `any` in production code (excluding test mocks).
**Fix**:
- Replace with proper generic types or union types
- `containerEl` should never be in the core engine — use dependency injection

#### GAP 3.2.2: Zero JSDoc on Public APIs
**Problem**: Not a single JSDoc comment exists on any exported class, method, or function. The `ARCHITECTURE.md` claims "All public APIs documented with JSDoc" as a success metric, but this has not been implemented.
**Affected**: All 50+ exported classes and functions.
**Fix**:
- Add JSDoc with `@param`, `@returns`, `@throws`, `@example` to all exported symbols
- Use `dts-bundle-generator` or `api-extractor` to auto-generate API docs

#### GAP 3.2.3: ExpressionEngine God Object
**File**: `ExpressionEngine.ts` (392 lines)
**Problem**: Single class handles: lexer lifecycle, parser lifecycle, VM lifecycle, caching, DAG tracking, line analysis, inline solve detection, error collection, diagnostics. This violates SRP.
**Fix**:
- Extract `ExpressionEvaluator` (VM + parser + bytecode)
- Extract `DocumentAnalyzer` (line scanning, inline solve detection, empty line detection)
- Extract `ExpressionCacheManager` (line cache, memo cache, DAG)
- Keep `ExpressionEngine` as a thin facade

#### GAP 3.2.4: Magic Numbers
**Files**: Multiple
- `NowParselet.ts` — hardcoded date offsets
- `DiceRollParselet.ts` — dice configuration limits
- `Configuration.ts` — various magic numbers (acceptable, but undocumented)
- `DataQueryService.ts:90` — `30000` ms cache cleanup interval
- `CurrencyExchange.ts:17-23` — hardcoded list of 60+ currency codes
**Fix**:
- Move to `Configuration.ts` with named constants
- For currency list, load from a data file or external package

#### GAP 3.2.5: Inconsistent Error Handling
**Problem**: Some code paths throw, others swallow errors silently:
- `DataQueryService.ts:275-308`: Main thread fallback silently returns `null` on unknown data source
- `DataQueryWorker.ts:282-285`: `console.warn` for unknown sources instead of proper error propagation
- `DataSourceStrategy.ts:147-196`: `HttpDataSource` throws but `execute()` catches all and returns error objects — inconsistent with the `Promise<FetchResponse>` signature
- `UnifiedErrorFramework.ts` exists but is never used in the hot path (VM, parser)
**Fix**:
- Adopt the `SolveError` / `Result<T, E>` pattern from `UnifiedErrorFramework.ts` throughout
- Consistent strategy: either throw or return Result, not both

### 3.3 FLEXIBILITY — Plugin System Disconnect

#### GAP 3.3.1: Plugin System Not Wired to Engine
**Files**: `PluginSystem.ts` vs `ExpressionEngine.ts`
**Problem**: `PluginManager` and `ProviderPackage` exist but the `ExpressionEngine` constructor hardcodes 9 `registerXxxParselets()` calls. The `PluginSystem` is completely disconnected. Switching providers requires modifying the `ExpressionEngine` constructor.
**Fix**:
- Accept a `PluginPackage[]` in the `ExpressionEngine` constructor
- Merge `PluginManager` with `ParseletRegistry` — let plugins register directly
- Add `unregister()` support with bytecode invalidation

#### GAP 3.3.2: ISolvePackage is Incomplete
**File**: `SolveAPI.ts:19-25`
**Problem**: `ISolvePackage` supports `prefixParselets`, `infixParselets`, `opcodeHandlers`, `variableSources` but NOT:
- Custom token types (no way to add new lexer tokens)
- Custom OpCode values (OpCode enum is closed)
- Custom formatting rules
- Custom data source strategies
**Fix**:
- Extend `ISolvePackage` with optional `customTokens`, `opcodes`, `formatters`, `dataSources`
- Add lexer extensibility (moo supports dynamic rule addition)

#### GAP 3.3.3: No Runtime Plugin Loading
**Problem**: The architecture assumes all plugins are registered at startup. There's no mechanism to load/unload plugins at runtime while preserving state.
**Fix**:
- Add `engine.loadPlugin(pkg)` and `engine.unloadPlugin(name)` methods
- Track plugin contributions for clean removal
- Version check for plugin compatibility

#### GAP 3.3.4: Operator Precedence Cannot Be Extended
**File**: `BindingPower.ts`
**Problem**: `BindingPower` is a const object with hardcoded values. Plugins can't define new precedence levels without risking collisions.
**Fix**:
- Make binding power dynamic with `setBindingPower()` (function exists but is unused)
- Add validation for binding power conflicts
- Document the precedence scale and reserved ranges

### 3.4 PERFORMANCE — Architectural Bottlenecks

#### GAP 3.4.1: No Performance Tests
**Problem**: Zero performance test cases exist. No benchmark harness. No regressions tracked.
**Fix** (see Section 5 — Benchmark Suite)

#### GAP 3.4.2: Parser Object Re-creation
**File**: `ExpressionEngine.ts:58`
**Problem**: `new Parser(this.registry)` creates a fresh parser each time. While lightweight, the parser's `load()` method still reinitializes internal state. For high-frequency single-expression evaluations (inline solves), this adds overhead.
**Fix**:
- Reuse parser instances across evaluations
- Make `load()` more efficient (avoid array allocation)

#### GAP 3.4.3: Double Pass for Inline Solves
**File**: `ExpressionEngine.ts:89-111`
**Problem**: `parseDocument()` first calls `findInlineSolvesInLine()` to get positions and expressions, then calls `evaluateLine()` which internally runs `evaluateLineWithDebug()` which checks for inline solves AGAIN via regex. This is a double-parse pattern.
**Fix**:
- Pass inline solve info from `parseDocument()` to `evaluateLine()` to skip the redundant check
- Or better: have `evaluateLine()` delegate to `parseDocument()` for inline solves

#### GAP 3.4.4: Uint8Array Limitation for Opcodes
**File**: `VM.ts:107`, `BytecodeBuilder.ts`
**Problem**: Opcodes are stored as `Uint8Array`, but `OpCode.PLUGIN_CUSTOM = 200` and all custom opcodes must be < 256. This is a severe constraint for extensibility.
**Fix**:
- Change to `Uint16Array` for opcodes (2x memory but 256x addressable opcodes)
- Or use variable-length encoding for opcodes

#### GAP 3.4.5: No Expression Compilation Cache
**Problem**: Even with LineCache, if the same expression appears on multiple lines (e.g., `s\`1 + 2\`` repeated 100 times in a doc), it's compiled 100 times.
**Fix**:
- Add a global expression → bytecode cache at the registry level
- Key by expression string hash
- Shared across all ExpressionEngine instances

#### GAP 3.4.6: Inefficient Value Type Checks in VM
**File**: `VM.ts:65-97`
**Problem**: The `binaryOp()` function uses sequential `if/else if` chains for type dispatch. With 12 value types, worst case is 12 comparisons per operation. Hot paths (ADD, SUB, MUL, DIV) each call this.
**Fix**:
- Use a lookup table indexed by `ValueType` pairs
- Or specialize common paths (Number+Number) before the general dispatch

#### GAP 3.4.7: String Interning in BytecodeBuilder is Correct But Not Fast
**File**: `BytecodeBuilder.ts:27-33`
**Problem**: `stringIndex` Map lookup + conditional allocation is correct but for high-frequency builds, the Map operations add up.
**Fix**:
- Consider a simpler array-based approach if string count is typically small
- Pre-size the strings array for known workloads

### 3.5 PRODUCTION READINESS — Reliability & Resilience

#### GAP 3.5.1: Stack Overflow / Infinite Loop Risk
**File**: `Parser.ts:19-48`
**Problem**: No maximum parse depth or expression complexity limit. A maliciously crafted expression like `1 + 1 + 1 + ... + 1` (10,000 terms) could cause deep recursion and stack overflow.
**Fix**:
- Add configurable `maxExpressionLength` (exists in config but not enforced)
- Add `maxParseDepth` and enforce in `parseExpression()`
- Add `maxBytecodeSize` check in `BytecodeBuilder.build()`

#### GAP 3.5.2: VM Has No Execution Limits
**File**: `VM.ts:107`
**Problem**: `while (ip < opcodes.length)` has no iteration limit. Malformed bytecode could cause an infinite loop.
**Fix**:
- Add `maxInstructions` limit (e.g., 10,000 by default)
- Add timeout mechanism via `performance.now()` checks
- Validate bytecode before execution (bounds check all indices)

#### GAP 3.5.3: No Input Sanitization
**Problem**: No validation of expression length, complexity, or content before parsing. The `ValidationConfig` in `Configuration.ts` defines limits but they are never checked.
**Fix**:
- Add `sanitizeExpression()` before lexing
- Reject expressions exceeding `maxExpressionLength`
- Reject expressions with more than `maxComplexity` tokens
- Consider allowlist/denylist for dangerous patterns

#### GAP 3.5.4: Garbage Collection Pressure
**File**: `VM.ts`, `ExpressionEngine.ts`
**Problem**: Every evaluation allocates: tokens array, BytecodeBuilder internal arrays, Uint8Array/Float64Array in `build()`, multiple string arrays. For 60fps editor integration with real-time parsing, this causes GC pauses.
**Fix**:
- Reuse BytecodeBuilder with `reset()` method (already exists but unused)
- Pool TypedArray allocations
- Consider incremental/streaming evaluation for large documents

#### GAP 3.5.5: Worker Failure Handling
**File**: `DataQueryService.ts:165-177`
**Problem**: Worker error handler falls back to main thread silently. No retry, no user notification, no error propagation to the expression engine.
**Fix**:
- Add configurable retry strategy
- Propagate worker failures to the UI layer
- Add health check/heartbeat for workers

#### GAP 3.5.6: DependencyGraph.removeLine Does Not Clean Up Consumer Map Correctly
**File**: `DependencyGraph.ts:68-79`
**Problem**: When removing a line, the `consumers` map still has entries pointing to that line number. Line 73-74 iterates the map but doesn't remove the line from other variables' consumer sets.
**Fix**:
- In `removeLine()`, also iterate the line's writes and remove from their consumer sets
- Or defer cleanup and filter lazily in `getAffectedLines()`

### 3.6 ENTERPRISE SCALABILITY — Architectural Concerns

#### GAP 3.6.1: Three Overlapping Cache Systems
**Files**: `LineCache.ts`, `UnifiedCache.ts`, `MemoCache.ts`
**Problem**:
- `LineCache` — per-engine, per-line cache with bytecode + results + dirty flags
- `MemoCache` — per-engine, epoch-based, keyed by expr+line hash
- `UnifiedCache` — generic LRU/LFU/TTL, not actually used by ExpressionEngine

These three are conceptually overlapping and create confusion about which is authoritative.

**Fix**:
- Consolidate into a single `ExpressionCache` with tunable eviction policies
- Separate concerns: bytecode cache vs. result cache vs. dependency cache
- Document the caching strategy clearly

#### GAP 3.6.2: No Cache Invalidation Strategy for Variable Changes
**File**: `ExpressionEngine.ts:351-355`
**Problem**: `markDirtyFromVariable()` marks lines dirty in the DAG but doesn't clear MemoCache entries. The `MemoCache.invalidate()` method takes a variable name but bumps the global epoch, which is over-aggressive (invalidates everything).
**Fix**:
- Cross-wire DAG with MemoCache — only invalidate expressions that depend on the changed variable
- Add per-variable epoch tracking in MemoCache

#### GAP 3.6.3: Global Shared State
**Files**: `sharedOpRegistry`, `sharedParseletRegistry`, `sharedLexer`, `sharedVariableResolver`
**Problem**: These singletons create global state that:
- Prevents multiple independent ExpressionEngine instances with different configurations
- Makes testing harder (state leaks between tests)
- Creates race conditions in worker environments
**Fix**:
- Make registries instance-scoped by default
- Provide shared singletons as opt-in convenience
- Add `clone()` method to registries for isolation

#### GAP 3.6.4: OpCode Enum is Not Extensible
**File**: `OpCode.ts`
**Problem**: OpCode is a TypeScript `enum` — closed at compile time. Plugins can use `PLUGIN_CUSTOM = 200+` but can't add named opcodes dynamically.
**Fix**:
- Switch to a numeric constant or registry pattern for opcodes
- Allow plugins to register named opcodes dynamically
- Or define a large reserved range in the enum for future use

#### GAP 3.6.5: No TypeScript Path Mapping for npm Consumption
**Problem**: The `@solve-js/*` path aliases work in the monorepo but won't resolve when consumers `import { ExpressionEngine } from 'solve-js'`. The package.json `main` points to `main.js` (esbuild output) but there's no proper `types` or `exports` field.
**Fix**:
- Add `"types"` field to `package.json`
- Add `"exports"` field with proper conditional exports
- Generate declaration files during build (`tsc --declaration --emitDeclarationOnly`)
- Consider publishing source maps

#### GAP 3.6.6: Currency Exchange Has Hardcoded Fallback Rates
**File**: `CurrencyExchange.ts:177-184`
**Problem**: `isCurrency()` and `getRateSync()` use a hardcoded list of ~60 currencies. This will become stale.
**Fix**:
- Load currency list from a data file or ISO 4217 package
- Auto-discover currencies from API responses
- Add TTL-based refresh for the currency list itself

#### GAP 3.6.7: Unsupported Operations Default to Silent Failure
**File**: `VariableResolver.ts:32-37`
**Problem**: `set()` calls `set` on ALL sources, even if one source doesn't support writing. No error, no return value indicating success/failure.
**Fix**:
- Return a result indicating which sources succeeded/failed
- Add `supportsWrite()` check to `IVariableSource` interface

---

## 4. Test Coverage Gaps

### 4.1 Missing Integration Tests
- **No tests** for `parseDocument()` through the full ExpressionEngine with all providers
- **No tests** for `parseDocument()` with multi-line variable dependencies
- **No tests** for DAG-based invalidation triggering re-evaluation
- **No tests** for the actual worker pipeline (DataQueryService + DataQueryWorker)

### 4.2 Missing Edge Cases
- **Modulo by zero** — not tested anywhere
- **Division by zero** — not tested
- **Stack underflow** — invalid bytecode that pops from empty VM stack
- **Concurrent variable access** — tested in `LongDocumentRobustness.spec.ts` but not with the DAG invalidation path
- **Unicode edge cases** — only in LexerFuzz, no systematic Unicode math symbol tests
- **Empty expressions** — `"  "` and `""` tested but not in `parseDocument()` context
- **Extremely long variable names** — not tested
- **Expression length at boundary** — maxExpressionLength not tested (because it's not enforced)

### 4.3 Missing Negative/Failure Tests
- Parser errors don't halt document processing — not tested
- Invalid bytecode execution resilience — partially tested in VMResilience
- Worker timeout handling — not tested
- Data source unreachable handling — not tested
- Circular variable dependencies — not tested (will cause infinite loop in DAG)

### 4.4 Test Infrastructure Issues
- **Duplicated helpers**: Every test file has its own `tokenize()`, `parseAndExecute()`, `parseAndExecuteFull()` — at least 5 copies with slightly different signatures
- **No shared test fixtures**: Test expressions are scattered across 30+ files
- **Async tests use `setTimeout` for waiting**: `UomParselets.spec.ts:45` — fragile timing

---

## 5. Benchmark Suite Plan

### 5.1 Benchmark Architecture

```
benchmarks/
├── bench.config.ts          # Shared config (iterations, warmup, etc.)
├── bench-runner.ts          # StatRunner: mean, p50, p95, p99, stddev
├── results/
│   └── results.json         # Historical results for regression detection
├── lexer-benchmarks.ts      # Tokenization performance
├── parser-benchmarks.ts     # Parse → bytecode time
├── vm-benchmarks.ts         # Execution time per opcode category
├── engine-benchmarks.ts     # Full parse + evaluate pipeline
├── document-benchmarks.ts   # Multi-line document parsing
├── cache-benchmarks.ts      # Cache hit/miss performance
└── integration-benchmarks.ts # Full Document.parseDocument() round-trip
```

### 5.2 Benchmark Scenarios

#### Lexer Benchmarks
| Scenario | Input | Metric |
|----------|-------|--------|
| Simple number | `"1 + 2"` | tokens/ms |
| Complex expression | `"sqrt(2^10 + 3.14 * 100)"` | tokens/ms |
| Unicode math | `"3 × 4 ÷ 2"` | tokens/ms |
| Full markdown line | `"# Heading with s\`1+2\` inside"` | tokens/ms |
| Long expression | 100-term addition chain | tokens/ms |
| Fuzz corpus | All LexerFuzz inputs | total time |

#### Parser Benchmarks
| Scenario | Input | Metric |
|----------|-------|--------|
| Simple arithmetic | `"1 + 2 * 3"` | build/ms |
| Deep nesting | `"((((1+2)*3)-4)/5)^6"` | build/ms |
| Function call chain | `"sqrt(pow(2, 3) + pow(4, 5))"` | build/ms |
| Mixed types | `"$100 + 10% of 50 kg"` | build/ms |
| Large expression | 50-term mixed expression | build/ms |

#### VM Benchmarks
| Scenario | Input | Metric |
|----------|-------|--------|
| Register ops only | Pre-built bytecode, 1000 ADD ops | exec/ms |
| Mixed ops | Pre-built bytecode, realistic mix | exec/ms |
| Function calls | Pre-built bytecode, 100 CALL_BUILTIN | exec/ms |
| UoM conversion | Pre-built bytecode, unit ops | exec/ms |
| Variable access | Pre-built bytecode, LOAD/STORE | exec/ms |

#### Engine (Full Pipeline) Benchmarks
| Scenario | Input | Metric |
|----------|-------|--------|
| Single expression | `"1 + 2"` | eval/ms |
| 1000 simple inline solves | 1000-line doc with `s\`1+1\`` | total ms |
| 100 variable assignments | `:x1 = 1` through `:x100 = 100` | total ms |
| Mixed document | 500 lines, mixed expressions | total ms |
| Re-evaluation (dirty) | Change 1 variable, re-parse 1000-line doc | total ms |

#### Cache Benchmarks
| Scenario | Metric |
|----------|--------|
| LineCache set/get hit rate | ops/ms at various sizes |
| MemoCache epoch invalidation | recompute time |
| Bytecode cache (proposed) | compile vs. cache hit time |

### 5.3 Regression Detection

```typescript
// Benchmarks that must not regress beyond threshold
const REGRESSION_THRESHOLDS = {
  lexer_simple:        { baseline: 0.01, threshold: 2.0, unit: 'ms' },    // 2x regression
  parser_simple:       { baseline: 0.05, threshold: 2.0, unit: 'ms' },
  vm_execution_simple: { baseline: 0.02, threshold: 2.0, unit: 'ms' },
  engine_parse_1000:   { baseline: 50,    threshold: 2.0, unit: 'ms' },
  // ...
};
```

Run benchmarks in CI with `--bench` flag. Compare against stored baselines. Fail build on threshold breach.

---

## 6. Recommended Implementation Order

### Phase 1: Critical (Pre-NPM Release)
1. **Consolidate cache systems** — Merge LineCache + MemoCache into a single coherent strategy
2. **Add input validation** — Enforce maxExpressionLength, maxNestingDepth
3. **Add VM safety limits** — Max instruction count, stack depth checks
4. **Fix DependencyGraph.removeLine()** — Bug in consumer cleanup
5. **Add proper TypeScript package configuration** — types, exports, declarations
6. **Standardize error handling** — Adopt SolveError/Result<T,E> across the board

### Phase 2: Performance (Pre-1.0)
7. **Expression compilation cache** — Cache bytecode by expression hash
8. **Reuse parser/lexer instances** — Eliminate per-call allocation
9. **Eliminate double-parse in inline solves** — Single-pass document processing
10. **VM type dispatch optimization** — Lookup table instead of if/else chains
11. **Benchmark suite** — Integrated into CI

### Phase 3: Flexibility (Post-1.0)
12. **Wire PluginSystem to ExpressionEngine** — Accept plugins in constructor
13. **Extend ISolvePackage** — Custom tokens, opcodes, data sources
14. **Runtime plugin loading/unloading** — With state preservation
15. **Extensible binding powers** — Dynamic precedence registration
16. **Dynamic OpCode range** — Beyond enum constraint

---

## 7. Bug Inventory

| # | File | Line | Severity | Description |
|---|------|------|----------|-------------|
| B1 | `DependencyGraph.ts` | 68-79 | Medium | `removeLine()` doesn't remove the line from other variables' consumer sets |
| B2 | `ExpressionEngine.ts` | 155-214 | Low | Double regex matching for inline solves (findInlineSolves + evaluateLineWithDebug) |
| B3 | `DataQueryService.ts` | 275-308 | Medium | Main thread fallback silently returns null for unknown data sources |
| B4 | `VariableResolver.ts` | 32-37 | Low | `set()` returns void with no indication of success/failure per source |
| B5 | `UnifiedErrorFramework.ts` | — | High | Framework exists but is completely unused in the hot path (VM, parser, lexer) |
| B6 | `ExpressionEngine.ts` | 230 | High | `containerEl: any` leaks Obsidian DOM type into core engine |
| B7 | `Cache: LineCache + MemoCache` | — | Medium | Two separate caches with overlapping responsibilities, different invalidation semantics |
| B8 | `OpCode.ts` | — | Medium | Closed enum prevents dynamic opcode registration |
| B9 | `CurrencyExchange.ts` | 177-184 | Low | Hardcoded currency list will become stale |
| B10 | `Configuration.ts` | — | High | Validation limits defined but never enforced |
| B11 | `Parser.ts` | 19-48 | High | No protection against infinite expressions / stack overflow |
| B12 | `VM.ts` | 107-418 | High | No execution limits — malicious bytecode can loop forever |
| B13 | `DataQueryService.ts` | 90 | Low | `setInterval` for cache cleanup never cleared on destroy |
| B14 | `Integration` | — | Medium | No test for circular variable dependencies (infinite DAG loop) |

---

## 8. Metrics Targets

| Metric | Current (estimated) | Target |
|--------|-------------------|--------|
| parseDocument 1000 lines | ~50ms | <20ms |
| Single expression eval (warm) | ~0.5ms | <0.1ms |
| Lexer tokenization (simple expr) | ~0.1ms | <0.02ms |
| Bytecode compilation (simple expr) | ~0.3ms | <0.05ms |
| Test coverage (core) | ~70% | >90% |
| `any` types in production code | ~15 | 0 |
| Untyped exported functions | ~30 | 0 |

---

## 9. Conclusion

The solve-js engine has strong architectural foundations — the Pratt parser is correctly implemented, the VM handles a rich type system, and the provider model enables extensibility. The primary risks for production are:

1. **No performance characterization** — We can't guarantee speed without benchmarks
2. **Unfinished error handling** — The excellent UnifiedErrorFramework is decorative, not functional
3. **Cache fragmentation** — Three caches with unclear ownership will cause subtle bugs
4. **Closed type system** — The OpCode enum and global shared state prevent true extensibility
5. **Package readiness** — path aliases and missing exports/types prevent npm consumption

Addressing Phase 1 items makes the library production-safe. Phase 2 makes it fast. Phase 3 makes it truly extensible.