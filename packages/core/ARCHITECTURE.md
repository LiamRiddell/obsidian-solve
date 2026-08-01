# @solve/core — Architecture

This document describes how the engine is put together: the evaluation pipeline, the
module map, the extension (package) system, the async/incremental evaluation model, and
a candid list of known architectural debt. It's written for two audiences: someone
orienting themselves in the codebase for the first time, and a future session doing a
deeper architecture review — the "Known limitations & open items" section at the end is
deliberately a punch list, not a sales pitch.

Nothing here is aspirational — every claim is grounded in the current source, not a
design intention that was never implemented. Where something is genuinely a gap, it's
called out as one.

## 1. What this engine does

`@solve/core` evaluates expressions like `2 + 2 * 10`, `50% of 200`, `3 days + 4 hours`,
`10 USD to GBP`, and `roll(1, 6)` — a small, extensible expression language aimed at
natural, calculator-like input rather than a general-purpose programming language. It
started as the evaluation core of an Obsidian plugin and is being extracted into a
standalone package so other frontends (a future desktop app, third-party consumers) can
depend on the same engine.

## 2. The evaluation pipeline

A single expression moves through five stages:

```
raw text
  │
  ▼
Lex          — ExpressionLexer / Lexer            → Token[]
  │
  ▼
Normalize    — TokenNormalizer                     → Token[] (phrase-fused, implicit-multiply inserted)
  │
  ▼
Parse        — PrecedenceParser + ParseletRegistry  → BytecodeProgram (via BytecodeBuilder)
  │            (a Pratt parser: prefix/infix parselets keyed by token type)
  ▼
Execute      — VM (createVM / executeBytecode)      → EvalResult (value | pending | error)
  │
  ▼
Format       — formatValue()                        → display string
```

`ExpressionEngine` (`src/engine/ExpressionEngine.ts`) is the orchestrator that owns one
instance of each pipeline stage's state (lexer, parser registry, VM, normalizer) plus the
supporting machinery described in sections 4-6 below (bytecode cache, DAG, async
resolution). Constructing `new ExpressionEngine(locale, diagnosticMode, config, ...,
packages)` builds this whole pipeline and registers the given packages (defaulting to
`BUILTIN_PACKAGES`) into it.

Two entry points sit on top of "evaluate one expression":
- `evaluateExpression(text)` / `evaluateLine(lineNumber, text)` — single-expression,
  synchronous-looking API (an in-flight async result comes back as a `Pending` value,
  not a suspended promise — see section 5).
- `parseDocument(text)` — evaluates every line of a multi-line document in one pass,
  building on the DAG/`ThreeTierEvaluator` machinery in section 6 for anything more than
  a one-off calculation.

## 3. Module map

Every top-level directory under `src/` corresponds to one npm subpath export
(`@solve/core/<dir>`), tiered by stability — see the [README](./README.md) for the full
tier table and what "advanced-public" vs. "internal" means for semver purposes. Summary:

| Directory | Owns |
|---|---|
| `api/` | `PackageRegistry`/`IEnginePackage` — the plugin-registration facade. |
| `engine/` | `ExpressionEngine` (orchestrator), `DocumentModel`, `ThreeTierEvaluator`, `AsyncResolutionBatcher`, `ExpressionEngineSafety` (validation). |
| `vm/` | `Value`/`ValueType`, `OpRegistry`, `VM.ts` (dispatch loop), `VMBuiltins` (plugin-function registry), `DependencyGraph`, `GlobalVariableStore`, `ScopeManager`. |
| `lexer/` | `ExpressionLexer` (scanner), `Lexer` (streaming wrapper), `Token`/`TokenTypes`. |
| `parser/` | `PrecedenceParser`, `ParseletRegistry`, `BytecodeBuilder`, `OpCode`, `BindingPower`, `PhrasePattern` (declarative phrase-grammar builder). |
| `normalizer/` | `TokenNormalizer`, `PhraseTrie` (multi-word phrase fusion), implicit-multiply rule. |
| `variables/` | `VariableResolver`, `IVariableSource`. |
| `resolvers/` | `ResolverRegistry`, `IAsyncResolver` contract, `createQueryResolver` (generic single-query async resolver factory). |
| `format/` | `formatValue()` and per-type formatters. |
| `language/` | Editor-agnostic language service: token categories, completions, highlighting. |
| `packages/` | The 16 built-in packages plus 2 opt-in (pluggable-provider) ones, each self-contained (own `{Domain}Package.ts` + `index.ts`). |
| `uom/` | Unit conversion (`UomConverter`) and currency exchange (`CurrencyExchange`). |
| `errors/` | `EngineError`, `ErrorFactory`. |
| `constants/` | `EngineConfig` and `DEFAULT_CONFIG`. |
| `utilities/` | Small stateless helpers (`stripQuotes`, `autoFormatIntegerOrFloat`, ...). |
| `services/` | `DataQueryService` (TanStack QueryClient construction/hand-off). |
| `cache/` | `LineCache` (per-line result + bytecode cache — internal). |
| `telemetry/` | `AllocationTracker` (opt-in per-stage timing/allocation diagnostics — internal). |
| `diagnostics/` | Structured 15-stage diagnostic pipeline for the playground's debug view (internal). |
| `types/`, `workers/` | Shared type-only helpers; Web Worker entry points for background compilation (internal). |

`examples/` (sibling of `src/`, not shipped in the published package — see `files` in
`package.json`) holds worked examples of authoring a third-party package: `examples/basic`
(minimal) and `examples/osrs` (full-featured: async resolver, custom highlighting,
completions).

## 4. The bytecode VM

Expressions compile to a flat bytecode program (`BytecodeProgram`), not an AST walk:

```ts
interface BytecodeProgram {
  opcodes: Uint8Array;   // instruction stream + inline operands
  numbers: Float64Array; // numeric constant pool
  strings: string[];     // string constant pool (deduplicated)
  hasAsync: boolean;     // true if any CALL_PLUGIN opcode was emitted
}
```

`BytecodeBuilder` (`parser/BytecodeBuilder.ts`) is what parselets call during parsing to
emit this stream — `emitOpcode`/`emitNumber`/`emitString`/`emitIndex`/`emitByte`. The VM
(`vm/VM.ts`'s `executeBytecode`) is a simple stack machine: it reads one byte at a time
from `opcodes`, dispatches on the `OpCode` value, and pushes/pops `Value`s on an internal
stack. `Value`/`ValueType` (`vm/Value.ts`) is a small tagged-union-style value type
(Number, Hex, BigInt, String, Boolean, Datetime, Uom, Array, Percentage, Unit, Error,
Pending) — see `format/FormatEngine.ts` for how each type renders.

**Constant-pool indexing is a real, bounded resource.** Because `opcodes` is a
`Uint8Array`, every constant-pool index written into it (from `emitNumber`/`emitString`)
is one byte — 0-255. `BytecodeBuilder` enforces this by throwing once a program would
need a 257th distinct numeric or string constant, rather than silently wrapping the index
(a real bug found and fixed during the 2026-07-30 hardening pass — see the memory/commit
history for `TOO_MANY_NUMERIC_CONSTANTS`). This is a hard ceiling on how many distinct
literals one expression can contain; it has never mattered in practice because
`config.validation.maxComplexity` (default 500) keeps a typical expression's token count
— and therefore its literal count — well under it, but it *is* reachable if a host
raises `maxComplexity` for legitimately larger expressions.

Extension authors dispatch custom logic via the one opcode built for exactly that:
`CALL_PLUGIN`, paired with a plugin-function index from `allocatePluginFunctionIndex()`
(`vm/VMBuiltins.ts`, a monotonic 0-255 allocator — same byte-width constraint as above,
same throw-on-exhaustion behavior) and a handler registered via
`IEnginePackage.pluginFunctions`. See section 5 for how a plugin function returning a
`Promise` — rather than a `Value` — flows through the rest of the pipeline.

## 5. The package (extension) system

A **package** is a plain data descriptor, `IEnginePackage` (`api/PackageRegistry.ts`):
lexer vocabulary, prefix/infix parselets, plugin functions, variable sources, async
resolvers, phrases, normalizer rules, token categories, completion items — every field is
optional, so a package can be as small as one parselet (see `examples/basic`).

`ExpressionEngine.registerPackage(pkg)` / `unregisterPackage(name)` process every field
declaratively and track exactly what was contributed to *shared* registries (per-engine
state — the lexer, the parser's `ParseletRegistry` — doesn't need tracking, since it's
already scoped to one engine instance) so unregistering can precisely reverse it. This
replaced an earlier pattern where a package's own module did side-effecting registration
at import time (found and removed during extraction — see `examples/osrs`'s
`OsrsPackage.ts` for the corrected, fully-declarative shape).

**16 built-in packages** ship in `BUILTIN_PACKAGES` (`packages/builtins.ts`), each
self-contained: `arithmetic`, `percentage`, `function`, `datetime`, `time`, `dice`,
`variables`, `uom`, `currency`, `vector`, `biginteger`, `conditionals`, `converters`,
`mathphrases`, `finance`, `weather`. A host can pass a filtered subset to the
`ExpressionEngine` constructor to omit domains it doesn't want (e.g. a calculator-only
engine with no dice/vector support).

Two more — `stocks`, `knowledge` — are exported but deliberately **not** in
`BUILTIN_PACKAGES`: both need a host-supplied data provider (no free/keyless stock-price
or general-knowledge API exists the way Open-Meteo is free for weather) and do nothing
useful unconfigured, so — matching `examples/osrs`'s own precedent for an opt-in package —
a host calls `createStocksPackage({ fetchQuote, ... })` /
`createKnowledgePackage({ answerQuery })` and adds the result to their own `packages`
array. Unconfigured, both fail with an honest "provider not configured" error rather than
silently returning fake data.

### 5.1 Three declarative extension points (the SDK surface beyond `pluginFunctions`)

Added during the SoulverCore-feature-parity pass so a third-party package author gets the
same force-multipliers the built-in packages use internally, not just `pluginFunctions`/
`normalizerRules`:

- **`PhrasePattern`** (`parser/PhrasePattern.ts`, `definePhrasePattern()`) — builds a
  `PrefixParselet` from a declarative list of `{ slots, emit }` alternatives instead of
  hand-written `parser.consume()`/`parseExpression()` sequences. Covers the
  "keyword-slot-keyword-slot" shape shared by most phrase grammars (`roll between X and
  Y`, `midpoint between X and Y`, `average of X, Y, Z`'s trailing shape). **Hard
  constraint**: every alternative's first slot must be a `keyword` slot, since the
  builder disambiguates alternatives via one `parser.peek()` before any bytecode is
  emitted (`BytecodeBuilder` is append-only, no speculative parse/rollback). This means
  it does NOT fit every grammar — when a value comes immediately after the trigger token
  (e.g. `clamp <value> between ...`, `if <condition> then ...`), the first "slot" would
  need to be an `expr`, which the builder rejects at construction time; those cases are
  hand-written `PrefixParselet`/`InfixParselet` classes instead (see
  `packages/mathphrases/parselets/ClampParselet.ts` and
  `packages/conditionals/parselets/IfThenElseParselet.ts` for two real examples, both with
  doc comments explaining why `PhrasePattern` doesn't apply). Proven against the Dice
  package's pre-existing `between X and Y`/`from X to Y` grammar (found and fixed a real
  latent bug in the process — the "and" word lexes as `PLUS`, not a literal `AND` token,
  which the original hand-written parselet silently masked via an unchecked `consume()`).
- **`createQueryResolver`** (`resolvers/QueryResolver.ts`) — a factory generalizing the
  proven TanStack-Query cache-key/staleTime/dedup pattern `CurrencyAsyncResolver`
  (`uom/CurrencyResolver.ts`) established for the one-`CALL_PLUGIN`-argument,
  one-cached-async-fetch shape most live-data lookups need (weather, stock prices,
  game-item prices — see `examples/osrs`). A package built on this only writes the fetch
  call and the response-to-`Value` mapping; caching, staleness, and Suspense-style
  pending-result plumbing come from the factory.
- **`IEnginePackage.asConverters`** (`api/PackageRegistry.ts`) — the extension point for
  the `converters` package's `<expr> as <type>` grammar (`50% as decimal`, `255 as hex`).
  A package contributes `{ name: (value: Value) => Value }` entries; names NOT already
  claimed by a built-in fast-path opcode (`percent`/`decimal`/`hex`/`fraction`/
  `multiplier`/`sci`/`binary`/`octal`/...) resolve at VM-execution time via
  `OpCode.CALL_AS_CONVERTER` against a runtime, string-keyed registry
  (`vm/VMBuiltins.ts`'s `asConverterRegistry`) — no lexer keyword registration needed for
  a custom name, since the `AS` parselet accepts any bare-word token (`CONVERTER_NAME` or
  plain `IDENT`) after "as" and reads its raw text.
- **`LexerVocabulary.rawLinePatterns`** (`lexer/ExpressionLexer.ts`) — the newest
  extension point, added for the `knowledge` package's `<query text> = ?` grammar, which
  is architecturally unlike every other package: the text before `= ?` ("distance to the
  moon") isn't valid Solve syntax and was never meant to tokenize/parse normally. A
  `rawLinePatterns` entry is tested against the RAW, untrimmed line text *before*
  per-character tokenization begins; on match, the whole line becomes one synthetic token
  (the trimmed capture group as its value) and the normal scanner never runs for that
  line — see `packages/knowledge/`'s `KnowledgeQueryParselet.ts` for the reference
  consumer. Zero cost when unused (a `length === 0` guard before the check ever runs).

Four extension points now cover the SDK surface beyond `pluginFunctions`/`normalizerRules`
(`PhrasePattern`, `createQueryResolver`, `asConverters`, `rawLinePatterns`) — each was
added because a real built-in package needed it first, not speculatively.

### 5.2 Package compatibility checking (`api/PackageCompatibility.ts`)

A fifth piece of SDK surface, but a different KIND from the four above — not a way to
build a package, a way to catch two packages FIGHTING each other before it becomes a
silent bug. `checkPackageCompatibility(candidate, existingPackages)` statically compares
a package's declared fields against every other package's, across every collision-capable
field `IEnginePackage` has (parselet token types, phrases, `asConverters` names,
`pluginFunctions` indices, lexer keywords/operators, async-resolver namespaces, token
categories), and returns a structured report (`error`/`warning`/`info` per conflict) —
pure and side-effect-free, callable before an engine even exists.

`ExpressionEngine.registerPackage()` calls it automatically on every registration (logging
via `console.warn`/`console.error`, never blocking — matches this codebase's established
"warn and proceed" convention for `ParseletRegistry`/`asConverterRegistry` collisions
elsewhere) — this is the "load-up resiliency" half: a host doesn't have to remember to run
a check, it happens for free every time a package loads. Motivated by two real incidents
this session: (1) three parallel background agents independently claiming the same
`CALL_BUILTIN`/plugin-function indices — exactly the `pluginFunctionIndex` conflict kind
this catches at `error` severity; (2) the currency package's real descriptor
(`CurrencyPackage.ts`) and its parallel test-harness helper
(`packages/currency/parselets/index.ts`) silently drifting out of sync when new currency
symbols were added to one but not the other — a different bug class (two hand-written
registration paths for the SAME package, not two packages colliding), which this checker
does NOT catch, but which is exactly why the checker's own test suite includes a
regression guard running it against the real, live `BUILTIN_PACKAGES` array rather than
only synthetic fixtures.

**A real, load-bearing lesson from building the four newest packages** (`time`,
`conditionals`, `converters`, `mathphrases`): this codebase has a *tested, intentional*
policy that a colon-prefixed variable name (`:name = expr`) cannot be a keyword-shaped
word — `VariableParselet`/`GlobalVariableParselet` only accept `IDENT`/`UNIT` tokens after
`:`, by design (see their doc comments and the "reserved-keyword regression" test in
`__tests__/packages/variables/parselets/GlobalVariableParselets.spec.ts`). A real
regression happened mid-session: claiming "total" as a bare global keyword (for
`total of X, Y, Z`) broke a pre-existing, shipped playground example using `:total` as a
variable. The fix, now the established pattern for any new trigger word that's also a
plausible variable name (a common noun — "total", "average", "count", not a verb/technical
term like "clamp"): fuse the FULL multi-word phrase the grammar actually needs ("total
of", "average of", "midpoint between") into one synthetic token via the package's
`phrases: Record<string, string>` field, rather than claiming the leading bare word. See
`packages/mathphrases/MathPhrasesPackage.ts`'s doc comment for the complete reasoning,
including why `clamp` was judged low-risk enough to stay a bare keyword (the value sits
between the trigger and its qualifying keyword, so it can't be phrase-fused, and it's not
a common variable name the way "total" is).

### 5.3 Engine-version compatibility gating (`api/EngineVersionCompatibility.ts`)

A sixth piece of SDK surface, and a deliberately different KIND from §5.2's checker, even
though the two sound similar. §5.2's `checkPackageCompatibility()` answers "do these two
SIMULTANEOUSLY-registered packages' declared fields collide" — always advisory, every
conflict including `error` severity just gets logged, registration always proceeds. This
module answers a different question — "can THIS package's declared engine-version range run
against the engine that's actually running RIGHT NOW" — and unlike every other compatibility
signal in this codebase, an unsatisfied (or malformed) `IEnginePackage.engineVersion` is a
hard **rejection**: `registerPackage()` throws (`PACKAGE_ENGINE_VERSION_MISMATCH` /
`PACKAGE_ENGINE_VERSION_INVALID_RANGE`, both `ErrorCategory.CONFIG`), not a warning. The two
checkers are kept in separate files/report types on purpose — folding a genuinely-blocking
check into §5.2's "always advisory" contract would mislead a future reader who's learned
(correctly, until now) that nothing from that module ever blocks.

`checkEngineVersionCompatibility(pkg, engineVersion?)` is the pure predicate (mirrors §5.2's
"return a result, caller decides" shape); `assertEngineVersionCompatible(pkg, engineVersion?)`
is the thin throwing wrapper both `ExpressionEngine.registerPackage()` and the `PackageRegistry`
singleton call as the literal first thing they do — before §5.2's checker, and before the
duplicate-name/unregister guard, so re-registering an incompatible "upgrade" for an
already-working package never tears down the working original first. `engineVersion` is
optional on `IEnginePackage`; omitting it means "no declared constraint," so every package
that predates this field (all 16 built-ins, `examples/osrs`) keeps registering unchanged.
`ENGINE_VERSION` (`constants/version.ts`) is sourced directly from this package's own
`package.json` at build time (a JSON import, inlined by esbuild — no runtime `fs` read), so it
can never drift from what's actually published.

**One real caveat this feature depends on but does not fix**: its long-term value assumes
`package.json`'s `version` gets bumped in step with actual breaking changes to the
`IEnginePackage` contract or the advanced-public tier (§3's "for semver purposes" framing) —
a discipline this repo does not yet rigorously practice (dated engineering-log entries here
and in `ENGINE_ITERATIONS.md` don't currently correspond to version bumps). This pass adds the
mechanism; it does not retroactively fix that process gap.

## 6. Async evaluation

Not every value is available synchronously — currency rates, a game-item price API, any
`fetch`-backed data source. The engine models this as a discriminated union,
`EvalResult` (`vm/VM.ts`): `{ type: 'value', value }` | `{ type: 'pending', queryKey,
resolver, packageId, signal }` | thrown `EngineError`.

Two independent paths can produce a `pending` result:
1. **`IAsyncResolver.preflight()`** (`resolvers/ResolverRegistry.ts`) — called *before* VM
   execution. It's synchronous and cache-only: if the data an expression needs isn't
   already cached, it kicks off (or reuses) a fetch and returns immediately with a
   `queryKey` + the in-flight `Promise`, and the VM never runs for that evaluation.
2. **A plugin function returning a `Promise`** via `CALL_PLUGIN` (section 4) — the VM
   itself produces the pending result mid-execution.

Both converge on the same resolution path: `ExpressionEngine.resolveAsync()` awaits the
`resolver` promise in a `try`/`catch`, then hands the outcome (success or error) to
`AsyncResolutionBatcher`, which **collapses multiple resolutions arriving in the same
microtask into a single DAG walk + re-evaluation pass** (rather than one DAG walk per
resolution) and emits typed events (`AsyncResolutionEvent`: lines-updated or error) via
either `getEventStream()` (a `ReadableStream`, for reactive consumers) or a listener
callback. **A rejected plugin-function promise is handled by the same `try`/`catch` as a
resolver rejection** — this was a real test-coverage gap (not a bug) found and closed
during the 2026-07-30 hardening pass.

Cancellation runs on a single `keystrokeSignal: AbortSignal` set by the host before each
evaluation — a new keystroke aborts the old signal, and every in-flight fetch/preflight
checks it before acting on stale data (`abortLogger.staleDataDiscarded(...)` traces this
in dev). Per-engine-instance TanStack `QueryClient`s (`services/DataQueryService.ts`)
provide the actual fetch deduplication/caching underneath resolvers.

## 7. Incremental evaluation over a document

A document isn't re-evaluated line-by-line from scratch on every keystroke. Three pieces
work together:

- **`DependencyGraph`** (`vm/DependencyGraph.ts`) — tracks, per line, which variables it
  reads and writes, and the reverse (which lines consume a given variable) so that
  redefining a variable can find exactly which downstream lines need re-evaluation
  (`getAffectedLinesInOrder`), instead of re-running the whole document.
- **`ScopeManager`** (`vm/ScopeManager.ts`) — resolves a variable read as of a given line
  number to the closest *preceding* definition (not simply the most recent write), so a
  variable redefined further down a document doesn't retroactively change an earlier
  line's reads.
- **`ThreeTierEvaluator`** (`engine/ThreeTierEvaluator.ts`) over a persistent
  `DocumentModel` — the actual per-keystroke/per-scroll scheduling policy:

  | Tier | Condition | Action |
  |---|---|---|
  | 1 | Visible + dirty (new/changed) | Full pipeline: lex → parse → compile → execute, synchronously on the main thread. |
  | 2 | Visible + clean (cached) | Execute from cached bytecode only — skips lex/parse/compile entirely. |
  | 3 | Invisible + dirty | Compile-only (for DAG read/write extraction); can be dispatched to a Web Worker. |
  | — | Clean, empty, or non-evaluable | Skipped entirely. |

  Lines are always processed in ascending document order so that by the time a Tier-2
  (cached) line runs, every preceding Tier-1 line has already updated the shared VM's
  variable state.

  **Known bug, not yet fixed** (found in a 2026-07-30 architecture review — see section
  12, item P0-1): a line whose result is `Pending` (async — currency conversion, a
  `CALL_PLUGIN` promise, a global-variable read not yet resolved) is incorrectly marked
  clean by both `evaluateTier1` and `evaluateTier3`, because "no exception thrown" is
  treated as success and a `Pending` `Value` is truthy. Once marked clean, a re-evaluation
  of that line routes to Tier 2, which calls `executeCached()`/`executeRaw()` directly —
  a path that **never runs `ResolverRegistry.preflightAll()`**. This breaks the invariant
  `LOAD_GLOBAL_VAR`'s VM handler depends on (that preflight always guarantees a global
  variable is resolved before this opcode runs) and can produce a raw, uncaught
  `TypeError` instead of a controlled error/Pending state.

## 8. Configuration & safety limits

`EngineConfig` (`constants/Configuration.ts`) has six sections — `date`, `dice`,
`performance`, `validation`, `vm`, `worker`, `diagnostic` — each with its own defaults in
`DEFAULT_CONFIG`. Safety validation (`engine/ExpressionEngineSafety.ts`) runs before
parsing: `maxExpressionLength` (raw character count) and a `complexityScore = tokens +
functionCalls×5 + nestingDepth×10` bound (`maxComplexity`) reject pathological input
before it reaches the parser; the VM itself separately bounds `maxStackDepth` and
`maxInstructions` to stop runaway/malformed bytecode.

**Known footgun, not yet fixed** (tracked as a follow-up): `ExpressionEngine`'s
constructor merges a caller's config with `{ ...DEFAULT_CONFIG, ...config }` — a
**shallow, top-level-only merge**. Passing a partial section (e.g. `{ performance: {
defaultCacheSize: 3 } }`) silently drops every *other* field of that section rather than
merging it with defaults, unlike `ConfigManager.mergeConfig()` (same file) which does
merge per-section. Every test that overrides a config section already works around this
by supplying the section in full. This should be fixed to match `ConfigManager`'s
behavior, with a full-suite re-run afterward (some tests may be incidentally relying on
today's drop-the-rest-of-the-section behavior).

## 9. Caching layers

Three distinct caches exist at different scopes, with different (and not entirely
consistent) bounding behavior:

| Cache | Scope | Bounded? |
|---|---|---|
| `ExpressionEngine`'s bytecode cache (`bytecodeCache`) | Per-engine, keyed by expression text | Yes — `config.performance.defaultCacheSize` (default 2000), FIFO eviction. **Was hardcoded and unconfigurable until the 2026-07-30 hardening pass** — the config field existed and was documented but was read nowhere. |
| `LineCache` (`cache/LineCache.ts`) | Per-engine, keyed by (line, expression) | **No** — genuinely unbounded, grows with document size, no eviction logic exists anywhere in the class. Bounded implicitly only by document length (entries are removed when a line is deleted), not by any size cap. Flagged here as an open item, not fixed — introducing eviction into a per-line *correctness-critical* cache (it's not just a speed optimization; `ThreeTierEvaluator`'s Tier 2 depends on it having the right cached value) needs careful design, not a quick patch. |
| DAG (`DependencyGraph`) | Per-engine | Grows with distinct variable names and line count; no eviction, same category as `LineCache`. |

If a future review wants to bound memory more tightly for very large or very
long-lived documents, `LineCache`/DAG unbounded growth — not the bytecode cache, which is
now the one properly configurable cache — is the place to look.

## 10. Cross-instance isolation (the L1 gap)

This is the single largest known architectural gap, already tracked in
`plans/ARCHITECTURE_IMPROVEMENTS.md` under "L1 — EngineContext." Several registries are
module-level singletons rather than per-`ExpressionEngine` state: `sharedLexer`
(`lexer/Lexer.ts`), `sharedOpRegistry` (`vm/OpRegistry.ts`), `sharedVariableResolver`
(`variables/VariableResolver.ts`), `pluginFunctionRegistry` (`vm/VMBuiltins.ts`),
`sharedCurrencyExchange` (`uom/CurrencyExchange.ts`), and an active-QueryClient hand-off
(`services/DataQueryService.ts`).

In practice this is safe today because package registration is idempotent and every
engine instance the reference host (the Obsidian plugin) creates registers the same
built-in packages. It would **not** be safe to assume isolation between two engines
configured with genuinely different package sets in the same process. The fix shape
(`EngineContext` object owning instances of all of the above, injected rather than
imported as a module global) is already spec'd in `plans/ARCHITECTURE_IMPROVEMENTS.md` —
this is a hard prerequisite for a 1.0.0 release but not for shipping 0.x versions, as long
as this gap stays disclosed (see the README's "Known limitations" section).

## 11. Testing & verification

`packages/core` has **two** jest configs:
- `packages/core/jest.config.cjs` — standalone, scoped entirely to this package (no
  dependency on `src/app` or the monorepo root). Run via `npm test` from inside
  `packages/core`. This is what a future standalone repo (post Phase 3/4 extraction) will
  use as-is.
- The root `jest.config.js` — runs everything (this package + `src/app` + the playground)
  in one pass for the monorepo's own CI/dev loop.

A benchmark suite (`__tests__/benchmarks/*.spec.ts`) is excluded from both configs'
normal runs (`testPathIgnorePatterns`) and is meant to be run directly when investigating
performance — see `fullPipelineThroughputBenchmarks.spec.ts` for the most holistic one
(it's what surfaced the bytecode-cache-size bug described in section 9).

## 12. Known limitations & open items (punch list for a future review)

Updated 2026-07-30 after a dedicated architecture-review pass (three parallel research
agents: a deep-dive on this punch list plus fresh-eyes reading, a full benchmark-suite
audit, and a playground-productionization plan — the last of these lives in the
extraction-planning notes, not here, since it's a frontend/product question rather than
an engine architecture one). Priority = blast radius × confidence, not just severity.
Effort/risk estimates are the reviewing agent's, not a committed schedule.

Updated again 2026-07-31 after a provider-completeness pass (each built-in package's
wiki-documented spec cross-checked against its implementation) plus a `ParseletRegistry`
resiliency fix — see "Done since the last pass" below for both.

### P0 — correctness bugs worth fixing before 1.0

1. **Async `Pending` results incorrectly marked clean — Tier 2/3 bypass resolver
   preflight.** See section 7's inline note. `ThreeTierEvaluator.evaluateTier1`/
   `evaluateTier3` treat "no exception thrown" as success, but a `Pending` value doesn't
   throw; once wrongly marked clean, `executeCached()`/`executeRaw()` never re-runs
   `ResolverRegistry.preflightAll()`, breaking `LOAD_GLOBAL_VAR`'s "preflight already
   guaranteed this resolved" invariant. Separately, `AsyncResolutionBatcher.onLineResult`
   — the only mechanism that patches a resolved async value back into `DocumentModel` —
   is never wired inside `packages/core` itself; it's an external hook a host must set,
   undocumented as required. **Effort/risk: LARGE / HIGH.** Touches `ThreeTierEvaluator`,
   `DocumentModel`, and `ExpressionEngine`'s cached-execution path together; entangled
   with `plans/ARCHITECTURE_IMPROVEMENTS.md` Task 1 (pipeline unification, still only
   half-done — the "diagnostic" pipeline path this bug lives in is actually the real
   Tier-1 production path, not diagnostics-only). Sequence after L1 and Task 1 step 2,
   not before — both touch the same call paths.
   — **Partial fix 2026-08-01**: the specific "silently wrong number" symptom of this bug
     class — plain arithmetic (`+`/`-`/`*`/`/`/`%`/`^`) on an `Error` or `Pending` operand
     silently coercing it to `0` via `Value.toNumber()` and producing a confidently-wrong
     result — is now fixed at the operator level. `vm/VMConversion.ts`'s `binaryOp()`
     (the shared fallback every one of ADD/SUB/MUL/DIV/MOD routes through for
     non-Number/Boolean/Datetime/Uom-rate operand pairs) and `VM.ts`'s `EXP` opcode (which
     never called `binaryOp()` at all — it called `Math.pow()` directly on raw
     `toNumber()` output) now both short-circuit and propagate the `Error`/`Pending`
     operand unchanged instead of computing with it as `0`. Found via
     `packages/lines/`'s cross-line-reference regression tests
     (`LinesParselets.spec.ts`'s "P0-interaction guard" describe block) — `prev + 1` on a
     line whose `prev` target had errored was silently returning `1`. This closes the
     arithmetic-level symptom engine-wide (not just for `packages/lines`); the underlying
     Tier 2/3 preflight-bypass/caching bug this item is actually about is still open.
2. ~~**`maxStackDepth` is documented as a safety limit but is dead code.**~~ **FIXED
   2026-07-30.** `createVM()`'s `push()` had the only bounds check, but
   `executeBytecode()` never called it — every one of the VM's ~40 push sites called
   `stack.push(...)` on the raw array directly. Fixed by adding one cheap
   `stack.length > maxStackDepth` check per instruction in the hot dispatch loop (same
   cost class as the pre-existing `maxInstructions` check right next to it — a single
   comparison, not a per-push-site check) — throws `STACK_LIMIT_EXCEEDED` instead of
   silently letting the stack grow unbounded. Added `VM.getMaxStackDepth()` to expose the
   value (previously only captured in `createVM`'s closure). Two existing tests
   (`VMOpcodes.spec.ts`'s "stack overflow" test, `VMResilience.spec.ts`'s "max stack
   depth" test) had literally named themselves after this exact scenario but could only
   assert `expect(result).toBeDefined()` because the limit wasn't enforced — updated both
   to assert the real thrown error. Re-ran `fullPipelineThroughputBenchmarks.spec.ts`
   before/after: no measurable regression.
3. ~~**`IEnginePackage.opcodeHandlers` is a fully dead extension point.**~~ **FIXED
   2026-07-30 (removed, not wired up).** `api/PackageRegistry.ts` documented it as a
   first-class, non-deprecated field with its own JSDoc example, and
   `registerPackage()`/`unregisterPackage()` still faithfully registered/reversed it into
   `sharedOpRegistry` — but `VM.ts`'s dispatch switch never called into `OpRegistry` at
   all and had no `default:` case, so a custom opcode silently did nothing (and desynced
   the rest of that expression's opcode stream). Took the deprecate/remove path over
   wiring dead dispatch machinery, since `CALL_PLUGIN`/`pluginFunctions` already provides
   working custom dispatch and no shipped package used `opcodeHandlers`: removed the field
   from `IEnginePackage`, its handling in `registerPackage()`/`unregisterPackage()`, and
   the `OpcodeHandler`/`IOpcodeHandlerRegistration` types from the public `@solve/core/vm`
   barrel (they're still exported from `vm/OpRegistry.ts` directly as internal
   implementation detail — `OpRegistry`/`sharedOpRegistry` themselves are untouched, still
   needed for `VM`'s interface shape). Updated the one test
   (`__tests__/packages/PackageUnregistration.spec.ts`) that exercised this field —
   its "opcode handler is removed from sharedOpRegistry" test only ever checked registry
   bookkeeping, never real bytecode execution, which is exactly why nothing caught the
   dead dispatch in the first place.
4. **L1 — EngineContext** (section 10): the module-global singleton gap. Confirmed
   unchanged and still real — e.g. `setActiveQueryClient(this.queryClient)` is called
   right before every VM execution (`ExpressionEngine.ts`), a literal last-write-wins
   race if two engines' evaluations interleave across a microtask boundary. Largest,
   already-spec'd item; hard prerequisite for 1.0.0.
5. ~~**Shallow config merge.**~~ **FIXED 2026-07-31.** `ExpressionEngine`'s constructor did
   `{ ...DEFAULT_CONFIG, ...config }` — a single top-level spread, so overriding one field
   of a section (e.g. `{ performance: { defaultCacheSize: 500 } }`) silently replaced the
   *entire* section, dropping every other field in it to `undefined` instead of keeping its
   default. Fixed exactly as this item proposed: extracted `ConfigManager.mergeConfig()`'s
   per-section-spread body into a standalone exported `mergeEngineConfig()`
   (`constants/Configuration.ts`); both `ConfigManager` and `ExpressionEngine` now call it.
   No test relied on the old drop-the-rest-of-the-section behavior — full suite re-ran
   clean. Added regression coverage in both `Configuration.spec.ts` (direct
   `mergeEngineConfig`/`ConfigManager.update()` tests) and a real, default-constructed
   `ExpressionEngine` test overriding one field per section.

### P1 — robustness/consistency (real, smaller blast radius)

6. ~~**Raw `throw new Error(...)` bypasses the `EngineError`/`ErrorFactory` taxonomy.**~~
   **FIXED 2026-08-01.** `NumberParselet.ts`/`TokenNormalizer.ts` were fixed 2026-07-30 (see
   history below); this session's error-handling-refactor pass converted every remaining
   real site: `CurrencyExchange.ts` (7 sites — `CurrencyErrorCodes`, co-located per
   `errors/ErrorCode.ts`'s documented per-package pattern), `OpenMeteoClient.ts`/
   `WeatherPackage.ts` (5 sites — `WeatherErrorCodes`), `OpRegistry.ts`,
   `VMBuiltins.ts`'s `allocatePluginFunctionIndex()`, and `Value.ts`'s
   `splitRateUnit`/`timecodeFps`. A repo-wide sweep (not just `packages/core`) confirms
   **zero** raw `throw new Error(...)` sites remain anywhere in `packages/*/src` or
   `src/app` except `workers/engine.worker.ts`'s build-time
   `esbuild-plugin-inline-worker` sentinel, which is never actually reached at runtime
   (the whole file is replaced by the plugin before execution) — left as-is deliberately.
   Also found and deleted 4 fully-dead legacy `Error` subclasses in `src/app/errors/`
   (`EmptyPipelineError`, `UndefinedContextInPipelineError`,
   `UnsupportedCoercionOperationError`, `UnsupportedVisitorOperationError`) — zero
   references anywhere in the live tree, residue from a pre-VM "pipeline"/"visitor"
   evaluation architecture this codebase no longer has. See `AGENT.md` for the
   authoritative error-handling reference going forward.
   <details><summary>Original 2026-07-30 finding (superseded)</summary>

   **Correction to this item's original framing**: the claimed impact ("breaks
   DAG-preservation on compile errors") turned out not to apply to either fixed site —
   `ExpressionEngine.prepareExpression()`'s parse-attempt `catch` block already flattened
   ANY thrown value (raw `Error` or `EngineError` alike) to a plain message string and
   re-wrapped it in a real `EngineError` with `.context.reads`/`.context.writes` attached,
   so the DAG-preservation path `ThreeTierEvaluator` depends on was never actually
   bypassed by raw throws specifically — general taxonomy consistency was the real
   motivation, not a DAG-correctness fix. (This flattening was itself a separate, real
   error-quality bug, since fixed — see `AGENT.md`'s "preserve the original error"
   section.)
   </details>
7. ~~**`registerPackage()` has no duplicate-name guard.**~~ **FIXED 2026-07-30.** Calling
   it twice with the same `pkg.name` used to silently overwrite the tracked contribution
   record, permanently orphaning the first registration's shared-registry entries
   (plugin-function indices, variable sources, resolver namespaces, token categories) —
   unreachable/unreversible for the process's lifetime, since these are the same module
   globals as L1. Fixed by reusing `ResolverRegistry.register()`'s existing "destroy old,
   warn, replace" pattern: `registerPackage()` now calls `unregisterPackage(pkg.name)`
   first (with a `console.warn`) if that name is already tracked. Per-engine parselets
   (Map-keyed by token type) were already naturally idempotent under re-registration and
   needed no change.
8. **`CALL_PLUGIN` pending results hardcode `packageId: ''`** (`VM.ts`) — every
   plugin-function-sourced async result is attributed to `'_engine'` in diagnostics/DAG
   grouping regardless of which package's function actually ran. Confirmed **not** a
   correctness bug (the query key already embeds the function index, so no real
   collision), just a diagnostics-quality gap. Natural to fix alongside the L1 migration
   since both touch the plugin-function ABI.

### P2 — resource bounding (needs careful design, not a quick patch)

9. **`LineCache`/`DependencyGraph` unbounded growth** (section 9): confirmed, no eviction
   logic in either. **New wrinkle found in the 2026-07-30 review:**
   `ThreeTierEvaluator` already has a `PageManager` doing page-based LRU eviction of
   bytecode/results to bound memory — a partial, ad hoc bounding mechanism that isn't
   mirrored in `LineCache`/`DependencyGraph`. **Read `PageManager.ts` fully before
   designing any fix here** — a new independent eviction policy for `LineCache`/DAG could
   easily fight with or duplicate the one that already exists, rather than piggybacking
   on its cold/warm/hot page classification. Also flagged, not yet verified: `LineCache`
   is keyed by raw line *number*, not the stable `lineId` `DocumentModel` uses
   specifically to survive line-shifting edits — worth checking whether entries go stale
   after `insertLines`/`deleteLines` shift positions.
10. **Constant-pool byte-width ceiling** (section 4): a hard 256-distinct-literal cap per
    expression, enforced by throwing (fixed 2026-07-30) rather than the `Uint8Array`
    silently wrapping — the ceiling itself is unchanged. Fix would widen index-operand
    encoding to `Uint16` at ~12 sites in `VM.ts` plus `BytecodeBuilder.emitIndex()`; no
    migration concern since bytecode is never persisted across sessions. Deprioritized
    below every P0/P1 item — confirmed "has never mattered in practice," future-proofing
    rather than an active bug.

### P3 — minor / documentation-only

11. **`allocatePluginFunctionIndex()`'s 256-slot pool is never reclaimed** — a one-time
    cost per distinct plugin function under the documented intended usage (call once, at
    module scope; confirmed both shipped examples follow this). Only a real problem if a
    host dynamically constructs packages at runtime and violates that convention. Not
    worth a reclaim mechanism; strengthen the JSDoc warning instead.
12. **`packages/PackageSystem.ts`'s legacy class-based package contract** was already
    found dead and deleted during Phase 1 of the extraction — noted here only so a future
    reviewer doesn't go looking for it.

### Done since the last pass

- **Benchmark suite fully audited** (was item 6 in the prior version of this list): all
  11 files beyond `fullPipelineThroughputBenchmarks.spec.ts` reviewed. Found and fixed one
  real bug of the same class as the bytecode-cache-size issue: `TimelineDiagnosticCollector.
  getReport()` (`diagnostics/timeline-collector.ts`) rescanned its entire cumulative event
  history on every single call (never reset — deliberately, since the playground's
  per-line stats rely on that cumulative array), making diagnostic-mode evaluation O(n²)
  over a document's lifetime — confirmed via `diagnosticPipelineBenchmarks.spec.ts`
  showing "warm" diagnostic-mode evaluation *slower* than "cold," backwards from every
  other pairing in the suite. Fixed by maintaining the summary fields incrementally
  (mirroring the pattern `parseletEntries` already used) instead of rescanning; ~50×
  faster after the fix, with the fix verified to reproduce *identical* values to the old
  code (not just "faster," a behavior-preserving performance fix). Only affects
  `diagnosticMode=true` engines (the playground; production Obsidian editing always uses
  `diagnosticMode=false`). Two smaller, non-wiring issues also found in the same audit:
  `cancellationOverheadBenchmarks.spec.ts` has one environment-sensitive threshold
  (225µs vs. a 200µs budget on Node v24 — not evidence of a production bug, the one
  method that could compound this cost per-batch isn't called from any production path)
  and `builderPoolBenchmarks.spec.ts` shows ~0% (occasionally slightly negative) benefit
  from builder pooling — matches that file's own documented caveat about pool-cycling
  overhead sometimes exceeding allocation savings, not a wiring bug.
- **Provider-completeness pass against the project wiki (2026-07-31)** — read each
  built-in package's documented spec (GitHub wiki: Core Providers) and cross-checked it
  against the shipped implementation, one domain at a time. Found and fixed real,
  previously-undetected gaps in every domain touched:
  - **Arithmetic/Vector**: bare `(x, y[, z[, w]])` tuple literal (documented alternative
    to `vec2(...)`/`vec3(...)`/`vec4(...)`) was entirely unimplemented — `GroupParselet`
    only ever emitted plain grouping. Fixed in `PrecedenceParser.ts`'s Tier-1 `LPAREN_ID`
    case (the parselet registered in the registry for `LPAREN` is shadowed by this
    hardcoded fast path and never actually runs — see its own comment for why both must be
    kept in sync by hand).
  - **Datetime**: `tomorrow`/`yesterday` silently evaluated to the exact same instant as
    `now`/`today` (a zero-offset bug hidden because existing tests only checked internal
    consistency, never the actual ±1-day claim). `next <Weekday>`/`last <Weekday>` was a
    blind ±7-day offset that ignored the weekday name entirely, not the "actual next/last
    occurrence of that day" the wiki documents. `<unit> until/since <Datetime>` was
    entirely unwired (UNTIL/SINCE were lexed keywords with no parselet). All three fixed;
    date-literal parsing (ISO/European/US formats) confirmed as a separate, larger,
    still-open gap — flagged as follow-up work, not attempted here (see task tracker).
  - **Percentage**: the infix `100 increase by 10%` form (`IncreaseByParselet`) was fully
    implemented and exercised by its own test suite, but never registered in the real
    `PERCENTAGE_PACKAGE` descriptor — only a parallel test-only registry helper wired it
    up, so every "passing" test for this form was silently exercising a code path real
    consumers of the engine could never reach. Fixed; added a real-`ExpressionEngine`
    regression test specifically so this class of gap can't hide behind an isolated
    registry helper again.
  - **UOM**: `sourceUnit to ?` (conversion-possibilities query) was undocumented-as-dead —
    `QUESTION` had no parselet anywhere, so the query silently dropped the `?` and fell
    through to a plain conversion. Implemented via the `convert` package's public
    `convert/conversions` subpath export (its own code comment claiming "no possibilities
    API" was itself stale — the subpath just isn't part of the main entry point). Also
    confirmed a real, larger gap: the `convert` package only supports 16 of the ~25 measure
    categories the wiki documents (missing Speed, Voltage, Current, Parts-Per, etc.) —
    flagged as follow-up work, not attempted here.
  - **Dice**: the bare hyphen range `roll 4-8` (no keyword, no parens) threw a parse error
    — `DiceRollParselet` only recognized `BETWEEN`/`FROM` or a leading `LPAREN`. Fixed by
    consuming both bounds as plain `NUMBER` literals (not via `parseExpression()`, which
    would misparse `4-8` as a single subtraction). Also deleted `DiceRangeParselet.ts`,
    confirmed fully orphaned dead code (its logic is duplicated inline in
    `DiceRollParselet`; never imported anywhere).
  - Every fix above shipped with new unit tests, including — per this pass's own emphasis
    on catching real-vs-test-only wiring gaps — at least one test per domain that goes
    through a real, default-constructed `ExpressionEngine` rather than only the isolated
    per-package registry test harness.
- **`ParseletRegistry` collision visibility (2026-07-31)** — `registerPrefix()`/
  `registerInfix()` were a bare `Map.set()`: a second package registering a prefix/infix
  parselet for a token type another package already claimed silently won, with the first
  registration becoming permanently unreachable and zero signal that it happened. Now
  warns (via `console.warn`, matching the existing "warn and replace" pattern already used
  by `ResolverRegistry.register()`/`ExpressionEngine.registerPackage()`) when a *different*
  parselet instance overwrites an existing one — but not on idempotent re-registration of
  the same instance, which is the normal case every time a second `ExpressionEngine` is
  constructed in the same process (all built-in packages' parselets are module-level
  singletons re-registered into the shared registry on every engine construction). Verified
  the guard doesn't misfire anywhere across the full test suite.
- **SoulverCore feature-parity completion (2026-08-01)** — three parallel background
  agents (`isolation: "worktree"`) landed the remaining gaps identified by a full
  documentation-site audit (see `SOULVERCORE_FEATURE_AUDIT.md`): Datetime/Time
  completions (workdays/weekdays, timestamps/ISO8601, video timecode & frame rates),
  Live Data (`weather`/`stocks`/`knowledge` — see section 5.1's `rawLinePatterns` note),
  and Finance inflation + UOM cooking/volume conversions. Every new grammar followed the
  established phrase-fusion-over-bare-keyword policy (section 5.1's "load-bearing
  lesson") and used `allocatePluginFunctionIndex()` over hardcoded `CALL_BUILTIN`
  indices specifically to avoid the index-collision class two earlier parallel agents
  hit this same session. **Real, load-bearing discovery from this round**: `isolation:
  "worktree"` does **not** actually isolate `packages/core`, because a git worktree only
  ever contains committed content and `packages/core` is entirely uncommitted — all 3
  agents ended up mutating the same shared checkout with no real filesystem isolation,
  and one agent's sandbox additionally blocked it from writing to the shared path at
  all, requiring a manual post-hoc merge of its committed worktree branch (diffing each
  shared file — `Token.ts`, `TokenCategoryMap.ts`, `ExpressionLexer.ts`, `units.ts`,
  `VMBuiltins.ts`, `VM.ts`, `Value.ts`, `UomConverter.ts` — against the
  by-then-further-modified main checkout and hand-reconciling non-overlapping
  additions). Full four-command gate re-run clean after reconciliation: 153 suites /
  3232 tests passed, `tsc`/`tsup`/production `esbuild` all succeeded.
