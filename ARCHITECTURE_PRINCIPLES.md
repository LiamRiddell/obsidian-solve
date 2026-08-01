# ARCHITECTURE PRINCIPLES — solve-js

> How the system is structured and why. Every module's role and boundaries.

---

## 1. Data Flow

The user writes natural markdown text — `10 + 2`, `£100 in GBP`, `Now + 20 days`, or inline solves like `s\`1+2\``. The engine evaluates all of it; the frontend controls how results are presented in the document.

```
┌─────────────────────────────────────────────────────────────────┐
│  Obsidian Editor (CodeMirror 6)                                 │
│  ┌──────────────┐  ┌──────────────────────┐                     │
│  │ MarkdownView │──│ MarkdownEditorPlugin │  (renders results)  │
│  └──────┬───────┘  └──────────────────────┘                     │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 ExpressionEngine                        │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │    │
│  │  │  Lexer   │→ │  Parser  │→ │ Bytecode │→ │   VM   │  │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘  │    │
│  │       │                               │                  │    │
│  │  ┌────▼─────┐                ┌─────────▼──────┐           │    │
│  │  │  Cache   │◄──────────────►│  Dependency    │           │    │
│  │  │  Layer   │   Bytecode +   │  Graph         │           │    │
│  │  └──────────┘   Results      └────────────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐      │
│  │  Providers   │  │    PluginSystem  │  │  SolveAPI     │      │
│  │  (Arithmetic,│  │  (extensions)    │  │  (exposes API) │      │
│  │  UoM, etc.)  │  └──────────────────┘  └───────────────┘      │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

**The pipeline**: Raw markdown text → Lexer → Parser → BytecodeCompiler → VM → Value result → returned to frontend for rendering.

---

## 2. Module Responsibilities

| Directory | Module | Responsibility | Dependencies |
|-----------|--------|---------------|-------------|
| `lexer/` | `Lexer`, `ExpressionLexer` | Tokenise markdown + expressions | None (self-contained) |
| `lexer/registry/` | `TokenRegistry` | Token type definitions | None |
| `parser/` | `Parser` | Pratt parsing → AST | `ParseletRegistry` |
| `parser/` | `BytecodeBuilder` | AST → bytecode | `OpCode` |
| `parser/registry/` | `ParseletRegistry` | Register prefix/infix parselets | `BindingPower` |
| `parser/` | `BindingPower` | Operator precedence table | None |
| `parser/` | `OpCode` (enum) | Opcode definitions | None |
| `vm/` | `VM` | Execute bytecode → Value | `OpRegistry`, `Value`, `DependencyGraph` |
| `vm/` | `ScopeManager` | Variable scope and resolution | `VariableResolver`, `DependencyGraph` |
| `vm/` | `MemoCache` | Result caching (epoch-based) | None |
| `vm/` | `DependencyGraph` | Track line→variable dependencies | None |
| `vm/` | `Value` | Typed value representation | None |
| `cache/` | `LineCache` | Per-line result + bytecode cache | None |
| `cache/` | `LFUCache` | Bounded frequency-based cache (used by UomConverter) | None |
| `engine/` | `ExpressionEngine` | Orchestrates full pipeline | Everything above |
| `engine/` | `ThreeTierEvaluator` | Viewport-tiered evaluation over DocumentModel | `ExpressionEngine`, `DocumentModel` |
| `packages/` | `PackageSystem` | External package management | `ParseletRegistry`, resolvers |
| `providers/` | 9 provider modules | Domain-specific parselets and ops | `ParseletRegistry`, `OpRegistry` |
| `workers/` | `compilation.worker`, `execution.worker` | Off-main-thread compile/execute | Transferable bytecode |
| `diagnostics/` | `Event`, `Collector`, `Pipeline` | Diagnostic event system | None |
| `errors/` | `EngineError.ts`, `Result.ts`, `ErrorCode.ts` | `EngineError`, `Result<T,E>`, `ErrorFactory` — see `AGENT.md` | None |
| `api/` | `SolveAPI` | Public API exposure | `ExpressionEngine`, `PluginSystem` |
| `types/` | `ParsingResult`, `core` | Shared type definitions | None |
| `format/` | `FormatEngine`, `FormattingSettings` | Output formatting | `Value` |
| `uom/` | `UnitConverter`, `CurrencyExchange` | Units and currency | Workers, DataSources |

---

## 3. Architectural Rules

### 3.1 Dependency Direction (strict top-down)
```
lexer ← parser ← bytecode ← VM ← cache ← engine ← providers/plugins/workers/API
```
- Nothing imports upward
- `vm/` does NOT import `parser/` or `lexer/`
- `engine/` may import everything
- `providers/` may import `parser/` and `vm/` types but NOT `engine/`
- `cache/` is dependency-free

### 3.2 Caching Strategy

| Layer | What it stores | Invalidation | Lifetime |
|-------|---------------|-------------|----------|
| **Bytecode cache** | Expression string → `BytecodeProgram` | On grammar/provider change | Long-lived (static) |
| **Result cache (LineCache)** | Line number + hash → `Value` | On variable change via DAG | Per-document |
| **DAG dirty tracking** | Variable → dependent lines | On variable write | Per-document |

### 3.3 VM Execution Model
- Stack-based bytecode VM
- `Value` is immutable **by convention, not enforcement** — operations create
  new Values, and external code must never mutate Value fields. Internally the
  ValueArena reuses Value objects via `recycle()` during Tier-2 scroll
  execution, async resolvers may attach metadata (`timedOut`), and cache
  layers replace `entry.result` in place. Values handed out while the arena
  is active are only valid until the next arena reset — persist them with
  `persistentValue()` before storing.
- All numeric types: `Number`, `Hex`, `BigInt`, `Percentage`, `Uom`, plus vectors
- VM has hard instruction limit and stack depth limit
- `executeBytecode()` returns failures as `EvalResult`'s `{type:'error', error: EngineError}` arm rather than throwing (public `ExpressionEngine` methods re-throw at the boundary) — category is usually `EXECUTION`, but `INTERNAL` for invariant violations (stack underflow, an unresolved global that preflight should have guaranteed). See `AGENT.md`.

### 3.4 Provider System
- Each domain (arithmetic, units, datetime, etc.) is a **provider**
- Providers register parselets (prefix + infix) and opcodes
- Providers are registered in the engine constructor or via `PluginSystem`
- No provider may directly access the VM — only through opcodes

### 3.5 Unit Handling Rules
- **Strict case-sensitivity**: `C` ≠ `c`, `MB` ≠ `mb`. No case-insensitive fallback in the lexer.
- **No aliases**: `resolveUnit()` passes the unit identifier directly to the `convert` package — no remapping, no normalization.
- **knownUnits gate**: Only units natively recognized by the `convert` package are registered in `knownUnits`. If `convert` rejects an identifier, it won't lex as UNIT.
- **Currency codes**: ISO 4217 uppercase (`USD`, `EUR`, `GBP`), emitted by symbol parselets (`$`, `£`, `€`).

---

## 4. Key Design Decisions

### Why a bytecode VM instead of direct evaluation?
- Bytecode can be cached (expression → bytecode is expensive, bytecode → result is cheap)
- Enables instruction limits for safety
- Provides a stable compilation target for plugins

### Why Pratt parsing?
- Clean separation of prefix and infix operators
- Easy to extend with new parselets
- Natural precedence handling via binding powers

### Why epoch-based cache invalidation?
- On variable change, increment the epoch
- All cache entries from the old epoch are considered stale
- Cheaper than tracing individual dependencies for simple cases
- DAG handles fine-grained dirty-line propagation

### Why both `LineCache` and `MemoCache`?
- `LineCache`: stores bytecode + result keyed by line number (fast path for unchanged lines)
- `MemoCache`: stores result keyed by expression hash + line (survives line renumbering)
- **Note**: These overlap and should be consolidated (Phase 3 plan)

### Why strict case-sensitivity for units?
- The `convert` package is case-sensitive: `C` = Celsius, `c` = centiliter; `MB` = megabytes, `mb` = millibar (pressure). The `convert` package's interpretation is always authoritative — `knownUnits` is a lexer gate, not a semantic override.
- Case-insensitive matching creates ambiguity — a user who types `c` could mean centiliter (volume) or Celsius (temperature), and the engine can't guess.
- The lexer's `ciKeywords` function checks only the exact casing in `knownUnits`. No case-insensitive fallback for UNIT detection.
- Currency codes use ISO 4217 uppercase (`USD`, `EUR`, `GBP`) — `$`, `£`, `€` symbol parselets emit uppercase codes.
- **Rule**: what you type is what you get. No case normalization for units.

### Why no unit aliases?
- `resolveUnit()` passes units straight through to the `convert` package without remapping.
- Aliases (e.g. `mt→t`, `floz→US fluid ounce`, `sqm→m2`, `gb→GB`) were removed because:
  - They create ambiguity — a user who types `mt` might mean "metric ton" or some other unit.
  - They override the `convert` package's native behavior — `mb` is valid in `convert` as millibar, but an alias might silently reinterpret it as megabyte.
  - They make the system unpredictable — the unit a user types may not be the unit that gets used.
- **Rule**: only natively valid `convert` identifiers are registered in `knownUnits`. If `convert` doesn't recognize a unit, it won't lex as UNIT.

---

## 5. CI-Readiness Principles

We don't maintain CI config today — it overcomplicates rapid iteration. But the
architecture is designed to be CI-ready when the time comes.

### What "CI-ready" means for this project:
- **Deterministic tests**: No flaky tests, no `Date.now()` without seeding, no `Math.random()` without seeding
- **Fast default suite**: Default test run (excluding heavy/benchmarks/fuzz) completes in under 30 seconds
- **Typecheck first**: `tsc --noEmit` must pass before any commit — caught by pre-commit hook or CI
- **Test isolation**: Each test file is self-contained. No shared mutable state between suites.
- **Reproducible builds**: `npm install && npm run build` produces identical output on any machine
- **Platform agnostic**: All tests pass cross-platform (Windows, macOS, Linux) — Path separators, line endings handled

### What to add when we adopt CI:
1. `test` workflow: `npm ci && npx tsc --noEmit && npm test` on push/PR
2. `heavy-test` workflow: weekly run of benchmarks, fuzz, memory-leak suites
3. `release` workflow: build + publish to Obsidian community plugins on tag
4. Coverage reporting with minimum thresholds (80%+)
5. Automated dependency updates (Dependabot/Renovate)

## 6. Plugin Architecture (Future)

```
External plugin registers via PluginSystem
    │
    ▼
PluginSystem adds parselets to ParseletRegistry
PluginSystem adds opcodes to OpRegistry
PluginSystem registers variable sources
    │
    ▼
Next ExpressionEngine creation picks up new registrations
    │
    ▼
Bytecode cache is invalidated (new grammar = new bytecode)
```

- Plugins must NOT modify existing parselets or opcodes
- Plugin bytecode is isolated from core bytecode
- Plugin unload clears all contributions and invalidates cache