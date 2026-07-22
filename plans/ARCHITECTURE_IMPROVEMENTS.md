# Architecture Improvements — Implementation Plan

> Written 2026-07-22 after the full-code review on `feat/safety-limits`.
> Each task below is self-contained and specified for direct implementation
> (target: Claude Sonnet or any competent implementer without prior context).
> Tasks are ordered by value ÷ risk. Do them one at a time, in order, with the
> verification gate run between tasks.

## Ground rules (apply to every task)

- **Verification gate** after each task:
  ```
  npx tsc --noEmit
  node --expose-gc ./node_modules/jest/bin/jest.js --no-coverage   # 89 suites must pass
  npm run build                                                    # production build must succeed
  cd playground && npx vite build                                  # playground must still build
  ```
- Match existing style: tabs in `src/solve-js` and `src/app`, JSDoc on public
  symbols, `//#region` folding markers in ExpressionEngine.
- The playground (`playground/src`) imports engine internals via deep paths
  (`@/solve-js/src/...`). Grep the playground before renaming/removing any
  exported symbol.
- Do not change observable evaluation semantics unless the task says so.
  When a test encodes behavior a task intentionally changes, update the test
  and say so in the commit message.
- One commit per task, message prefixed `refactor:` / `fix:` as appropriate.

---

## Task 1 — Unify the triplicated evaluation pipeline in ExpressionEngine — ⚠️ PARTIAL (step 1/2 done)

**Status 2026-07-22:** Step 1 shipped — `prepareExpression()` (length check
→ COMMENT filter → normalize → complexity → read/write extraction →
bytecode cache lookup or parse+compile) now backs both
`evaluateWithTokens()` and `compileExpression()`, returning a discriminated
union so each caller maps failures to its own SolveError category.

Step 2 — folding `evaluateExpressionWithDiagnostic()` (the ~675-line,
15-stage diagnostic path) onto the same pipeline — was deliberately
**deferred**, not attempted quickly. It is the one task in this document
explicitly flagged as needing an enumeration of every early-exit before
touching it (see "Risk notes" below), the method is interleaved with
per-stage diagnostic event firing at a granularity `prepareExpression`
does not capture (per-token lex events, per-fusion normalizer events,
cache-hit-skips-parser-and-compiler-stages), and it is live in a shipping
Obsidian plugin. Attempting it under time pressure risks exactly the kind
of subtle drift this task exists to eliminate. Do step 2 in its own
focused session with the enumeration below done FIRST, in writing, before
any code changes.

**Problem.** `src/solve-js/src/engine/ExpressionEngine.ts` implements the same
pipeline three times:

1. `evaluateWithTokens()` — production path (safety checks → COMMENT filter →
   normalize → complexity → reads/writes → bytecode cache → parse/compile →
   async preflight → execute).
2. `evaluateExpressionWithDiagnostic()` — the same pipeline re-implemented
   with ~600 lines of diagnostic-stage recording interleaved (search for
   `15-stage evaluation pipeline`).
3. `compileExpression()` — the same front half (through compile), no execute.

They have already drifted (e.g. the diagnostic path lexes itself via
`resetExpression` while the production path receives pre-tokenized tokens;
empty-token handling differs slightly). Every future change must be made three
times.

**Target design.** One private pipeline with an optional observer:

```ts
interface PipelineObserver {
	onStage(stage: PipelineStageResult): void;          // structured stages array
	pipeline: DiagnosticPipeline;                        // event firing (fireTokenEmitted etc.)
}

interface PipelineRunOptions {
	lineNumber: number;
	expression: string;
	/** Pre-lexed tokens (skip lexing) or undefined to lex internally. */
	tokens?: Token[];
	/** Stop after compile — do not preflight or execute. */
	compileOnly?: boolean;
	observer?: PipelineObserver;   // undefined in production = zero overhead
}

private runPipeline(opts: PipelineRunOptions): PipelineRunResult;
```

**Steps.**
1. Create `src/solve-js/src/engine/EvaluationPipeline.ts` (or a private
   section in ExpressionEngine — prefer the separate file; ExpressionEngine
   is already ~2,300 lines). Move the stage logic there as small pure-ish
   functions that each accept `(state, opts)` and return the next state:
   `checkLength`, `lex`, `normalize`, `checkComplexity`, `extractRW`,
   `lookupBytecode`, `parseCompile`, `preflightAsync`, `execute`.
2. Each stage calls `opts.observer?.onStage(...)` / fires the matching
   diagnostic event **inside the stage**, using the exact payload shapes the
   current diagnostic path produces (see the `addDiagnosticStage` calls —
   stage names, icons, stepNumbers, and `StageOutput` discriminants must be
   byte-for-byte identical, the playground renders them).
3. Re-implement the three public entry points as thin wrappers:
   - `evaluateWithTokens(...)` → `runPipeline({ tokens, ... })`
   - `evaluateExpressionWithDiagnostic(...)` → `runPipeline({ observer, ... })`
     then assemble the existing return shape (`value/tokens/program/error/
     debug/diagnostic`) from `PipelineRunResult`.
   - `compileExpression(...)` → `runPipeline({ compileOnly: true, ... })`.
4. Keep the abort-listener discipline established in the current code: attach
   the keystroke listener before execute/preflight, detach on sync completion,
   keep attached for pending results (see `abortLocal`/`abortPreflight`
   removeEventListener calls added 2026-07-22).
5. Delete the now-dead duplicated bodies.

**Tests.** The suites that lock this behavior: `__tests__/engine/*`,
`__tests__/diagnostics/*`, `__tests__/integration/KeystrokeAbortController.spec.ts`,
and the playground stage rendering (manual: `cd playground && npx vite build`,
then load an expression and check the Pipeline tab shows all 15 stages).
Do NOT weaken any assertion to make this pass; the refactor is behavior-preserving.

**Risk notes.** The diagnostic path returns early at several points (length
fail, empty tokens, complexity fail, parse fail, pending) with specific
partial payloads — enumerate each early-exit in the current code first and
reproduce them as pipeline short-circuits. Watch `hasParens` propagation
(production path receives it from scanDocument, diagnostic path computes it
during lexing).

---

## Task 2 — Registry ownership: make package unregistration actually unregister

**Problem.** `ExpressionEngine.registerPackage()` (ExpressionEngine.ts,
`//#region Public API — Package registration`) writes opcode handlers into the
module-global `sharedOpRegistry` and variable sources into
`sharedVariableResolver`, but nothing ever removes them:
- `sharedOpRegistry` (`src/solve-js/src/vm/OpRegistry.ts`) has `register()`
  and no removal API.
- `sharedVariableResolver` (`src/solve-js/src/variables/VariableResolver.ts`)
  has `registerSource()` and no removal API.
- `ExpressionEngine.unregisterPlugin()` only calls `packageManager.unregister`
  (parselets/lexer/resolvers) and clears the bytecode cache.
- Also cross-engine leakage: every engine instance shares these globals, so a
  playground engine's registrations bleed into the Obsidian engine in tests.

**Target design.**
1. Add removal APIs:
   - `OpRegistry.unregister(opcode: number): void` (delete from its internal
     map; look at `register()` to mirror the data structure).
   - `VariableResolver.unregisterSource(source: IVariableSource): void`
     (identity removal from its source list).
   - `VMBuiltins.pluginFunctionRegistry` already supports `delete` — no change.
2. In `ExpressionEngine`, track per-package contributions at registration
   time:
   ```ts
   private packageContributions = new Map<string /*pkg name*/, {
   	opcodes: number[];
   	variableSources: IVariableSource[];
   }>();
   ```
   Populate inside `registerPackage()` (the package's name is on
   `ISolvePackage.name` — verify the field name in `api/SolveAPI.ts`).
3. Add `unregisterPackage(name: string)` that reverses parselets is NOT
   needed (isolated per-engine registry dies with the engine); it must
   reverse only the *shared* contributions: opcodes + variable sources, then
   delegate to the existing `unregisterPlugin` path and clear the bytecode
   cache (grammar changed).
4. Wire `PackageManager.unregister()` (`packages/PackageSystem.ts`) to call
   back into the engine's contribution cleanup, or move the tracking into
   PackageManager — implementer's choice; keep ONE owner of the tracking.

**Tests to add.** New spec `__tests__/packages/PackageUnregistration.spec.ts`:
register a package with a custom opcode handler + variable source, verify it
works, unregister, verify (a) the opcode no longer dispatches (VM pushes 0 /
throws per current unknown-opcode behavior), (b) the variable no longer
resolves, (c) re-registering works cleanly.

---

## Task 3 — Engine lifetime: per-document state instead of global reset

**Problem.** `EngineProvider` (`src/app/engine/EngineProvider.ts`) is a
process-wide singleton. `MarkdownEditorViewPlugin` calls
`EngineProvider.reset()` on document switch to stop variables leaking between
documents — but every open editor pane shares the one engine, so:
- Two panes onto different notes fight over VM variable state; switching
  focus resets the other pane's engine mid-flight.
- The reset also throws away the bytecode cache for *all* documents.
- Widget DOM ids `#osr-${lineNumber}` (ExpressionResultWidget.toDOM) collide
  across panes, so the commit commands in `src/app/main.ts` can click the
  wrong pane's widget.

**Target design.** One `ExpressionEngine` + `DocumentModel` +
`ThreeTierEvaluator` per **editor plugin instance** (i.e., per
`MarkdownEditorViewPlugin` construction), owned as instance fields; kill
`EngineProvider.reset()` from the update path entirely.

**Steps.**
1. `MarkdownEditorViewPlugin` constructor: `this.engine = new
   ExpressionEngine(locale, false, EngineConfigMapper.toEngineConfig(settings))`
   instead of `EngineProvider.get()`. Store it; use it everywhere the file
   currently calls `EngineProvider.get()`.
2. Document switch branch: replace `EngineProvider.reset()` with
   `this.engine.clear()` (per-instance; batcher stream survives — it is
   recreated by `clearAll()` as of 2026-07-22) and re-run `evaluateAll`.
   The event-stream re-subscription added on switch can then be dropped IF
   `clear()` keeps the same engine instance (it does) — but keep the
   re-subscription if you keep recreating engines.
3. `destroy()`: call `this.engine.clear()` so timers/pending resolutions die
   with the pane.
4. Keep `EngineProvider` itself for the two commands in `main.ts`
   (`evaluate-expression`) and `SettingsTab` preview use — those are
   user-invoked one-offs and fine on a shared instance. Remove the exported
   `sharedEngine` binding if it has no remaining importers (grep first).
5. Widget ids: change `div.id = \`osr-${lineNumber}\`` to a class +
   `data-line` attribute, and scope the queries in `main.ts` commit commands
   to the active editor's `containerEl` (they already query within
   `containerEl` — verify this bounds them to one pane; if `containerEl` is
   shared, scope via `.cm-editor` ancestor of the active view). Update the
   three commands to `querySelector(\`[data-osr-line="${n}"]\`)`.

**Shared-global caveat (do not skip).** `sharedOpRegistry`,
`sharedVariableResolver`, `sharedLexer`, and `pluginFunctionRegistry` are
still module globals: constructing two engines double-registers builtin
packages' opcode handlers. Verify `OpRegistry.register` is idempotent for the
same opcode (it overwrites — acceptable), and that `PackageManager.register`
throws on duplicate *external* package names only per-engine. Run the full
suite; `__tests__/engine/EngineIsolation.spec.ts` (if present) is the
relevant guard.

**Tests to add.** Spec that constructs two plugin instances (see
`src/app/codemirror/__tests__/MarkdownEditorViewPlugin.spec.ts` for the
mock-view pattern), defines `:x = 1` in doc A and asserts `x` is undefined in
doc B's engine.

---

## Task 4 — Deduplicate playground engine bridge

**Problem.** `playground/src/engine.ts` (~1,500 lines) contains two
near-identical functions, `runEngineWithStreaming(...)` and `runEngine(...)`,
duplicating: line-loop evaluation, per-line result assembly, parselet
extraction, VM trace assembly, query-cache extraction (now duplicated again
for `dataPreview`), cache snapshots, and diagnostic event mapping.

**Target design.** Extract shared pure helpers into
`playground/src/engineShared.ts` (new file):
- `extractQueryCache(engine): { queryCache: QueryCacheEntry[]; queryClientConfig: QueryClientConfig }`
- `buildLineResult(...)` for the per-line result objects (including the
  `timedOut` flag)
- `mapDiagnosticEvents(lastDebugEvents): DiagnosticEventInfo[]`
- any other block that appears in both functions ≥ 90 % identical.

Then have both `runEngine` and `runEngineWithStreaming` call them. Do NOT try
to merge the two top-level functions themselves (streaming has genuinely
different control flow); just dedupe the assembly logic. Target: engine.ts
shrinks by ≥ 300 lines with `npx vite build` still green and the Pipeline /
Cache / Workers tabs visually unchanged (`npm run dev` in playground,
evaluate `10 + 5 * 2` and `osrs(Iron Axe)`).

---

## Task 5 — Replace EvalResults' non-enumerable `errors` with an explicit type

**Problem.** `evaluateLine()` returns `EvalResults extends Array<Value>` with
an `errors?: string[]` attached via `Object.defineProperty(..., enumerable:
false)` (ExpressionEngine.ts, search `EvalResults`). Invisible-to-JSON magic
properties on arrays are easy to lose (spread, `.map`, structuredClone all
drop it) and the playground/evaluator already had bugs in this area.

**Target design.**
```ts
export interface LineEvaluation {
	values: Value[];
	/** Failure messages from failed sub-expressions; empty when all succeeded. */
	errors: string[];
}
evaluateLineDetailed(lineNumber, lineText): LineEvaluation
```
Keep `evaluateLine()` as a thin back-compat wrapper returning the current
array shape (playground + evaluator call sites are numerous), implemented on
top of `evaluateLineDetailed`. Migrate `ThreeTierEvaluator.evaluateTier1` to
the detailed API (it currently catches and re-derives errors). Grep for
`\.errors` on evaluateLine results to find remaining consumers.

---

## Task 6 — Commit commands: stop driving edits through DOM clicks

**Problem.** The `commit-result-*` commands in `src/app/main.ts` locate
rendered widget DOM nodes and call `.click()`, which fires an event-bus event,
which mutates the document. This breaks headless/testing, breaks when a
result is off-screen (CM6 only renders visible decorations — "commit all
visible" is *implicitly* visible-only, but single-line commit fails for a
scrolled-away line), and depends on globally unique DOM ids.

**Target design.** Commands consult the evaluator state, not the DOM:
1. Expose the current `ThreeTierEvaluator`/`DocumentModel` for the active
   view. After Task 3, the plugin instance owns them; register the instance
   in a `WeakMap<EditorView, MarkdownEditorViewPlugin>` on construction
   (delete in `destroy()`), and add a static lookup
   `MarkdownEditorViewPlugin.forView(view)`.
2. In `main.ts`, get the CM `EditorView` from Obsidian's editor
   (`(editor as any).cm` is the established pattern in Obsidian plugins),
   look up the plugin instance, read `docModel.getLineAt(line)` →
   `state.results` / `state.expressions`, format with `formatValue`, and call
   the existing `onWriteResultEvent` logic directly (extract it from the
   event handler into a plain method so both the widget click path and the
   command path share it).
3. Keep the widget click behavior as-is (it has the right UX for mouse users).

**Tests.** `src/app/__tests__` currently has no command tests; add one that
fakes a DocumentModel with a result on line 2 and asserts the command path
produces the same line text as the widget path.

---

## Task 7 — getRateSync: decide the offline-currency story (needs owner input)

**Problem.** `CurrencyExchangeService.getRateSync`
(`src/solve-js/src/uom/CurrencyExchange.ts`) serves **hardcoded rates**
(`EUR: 0.854, BTC: 60000, ...`) via `CurrencyResolver` when no live rate is
cached. Users get a plausible-looking but wrong/stale conversion with no
indication.

**DECIDED (owner, 2026-07-22): Option A with a freshness window.**
Delete the hardcoded table. `getRateSync(from, to)` must return:
1. `1` for same-currency pairs (unchanged);
2. a cached **live** rate if one was fetched recently — maintain a
   `Map<"FROM:TO", { rate: number; fetchedAt: number }>` inside
   `CurrencyExchangeService`, written by `getRate()` on every successful
   fetch (store both directions), served by `getRateSync` while
   `Date.now() - fetchedAt <= RATE_FRESHNESS_MS` (use 15 minutes);
3. otherwise `null` → the caller (`CurrencyResolver`) falls through to the
   async path and the expression shows Pending until the fetch lands.

`__tests__/uom/CurrencyExchange.spec.ts` asserts the old fallback-table
behavior — update those tests deliberately: same-currency still 1, unknown
pair now null, and add a test that a successful `getRate` makes the pair
available synchronously within the freshness window (inject/fake `fetch`).

---

## Task 8 — Single source of truth for line results

**Problem.** Results live in three places: `LineCache` (engine),
`DocumentModel.LineState.results` (evaluator), and TanStack Query (async).
The async batcher updates LineCache; decorations read DocumentModel — the
2026-07-22 fix bridges them by re-running the evaluator on `lines-updated`,
which works but means every async resolution does a viewport re-evaluation to
copy values across.

**Target design (incremental, safe version).** Make the batcher patch the
DocumentModel directly: give `AsyncResolutionBatcher` an optional
`onLineResult(lineNumber, value)` callback (set by ThreeTierEvaluator or the
view plugin) invoked in `reExecuteMainThread`/worker-pool paths where it
currently does `entry.result = result`. The view plugin handler then only
rebuilds decorations — no re-evaluation pass. Keep LineCache updates as-is
(engine-internal consumers read it). Full unification (deleting one of the
stores) is a larger project; do NOT attempt it in the same change.

---

## Task 9 — Typed batcher metrics (small) — ✅ DONE (commit b520953)

`ExpressionEngine.getBatcherMetrics()` reads `(this.batcher as any).pending`
etc. Add read-only accessors on `AsyncResolutionBatcher`
(`get pendingCount()`, `get listenerCount()`, `get workerOffloadCount()`) and
use them. Delete the `as any` casts. Pure mechanical change; existing
`AsyncResolutionBatcher.spec.ts` sections cover the metric values.

---

# Part II — Large-scale improvements (post-Task-1..9 roadmap)

These are the structural changes that SHOULD happen once Part I lands. They
are bigger than one sitting each; every one should get its own detailed spec
(in the style of Part I) before implementation. Ordered by recommended
sequence — later items depend on earlier ones.

## L1 — EngineContext: eliminate module-global engine state — NOT ATTEMPTED

**Status 2026-07-22:** Deliberately not started in the fast pass that did
Part I and L3/L5/L6. This is the single largest item in this document: it
changes the plugin-function ABI (`pluginFunctionRegistry`'s
`(args: Value[]) => Value` signature), touches six module-global
singletons each referenced from multiple files (`sharedLexer`,
`sharedOpRegistry`, `sharedVariableResolver`, `pluginFunctionRegistry`,
`sharedCurrencyExchange`, the active-query-client hand-off), and its own
spec says to do it "AFTER Task 1" (which is only half-done — see above).
Attempting it now would mean redesigning the ABI on top of an
already-substantially-modified engine core (Task 2's registry-unregister
tracking, the P2 layering change, this session's LineCache rewrite) without
the settled foundation the ordering was designed to provide. Do this in
its own dedicated session, after Task 1 step 2 is complete, migrating one
global at a time per the original spec (pluginFunctionRegistry → opRegistry
→ variableResolver → lexer → currencyExchange) with the full gate between
each.

**Why.** True isolation is impossible today: `sharedLexer`
(`lexer/Lexer.ts`), `sharedOpRegistry` (`vm/OpRegistry.ts`),
`sharedVariableResolver` (`variables/VariableResolver.ts`),
`pluginFunctionRegistry` (`vm/VMBuiltins.ts`), `sharedCurrencyExchange`
(`uom/CurrencyExchange.ts`), and the active-query-client hand-off
(`services/DataQueryService.ts`) are all module globals. Two engine
instances interfere; tests need careful clears; Task 3 (per-document
engines) is only safe because registration happens to be idempotent.

**Shape.** Introduce an `EngineContext` object created in the
`ExpressionEngine` constructor that owns instances of all of the above.
Everything that currently imports a `shared*` singleton receives the context
(or the specific dependency) via constructor/parameter injection. The VM
plugin-function ABI grows a context parameter:
`(args: Value[], ctx: EngineContext) => Value | Promise<Value>` — this also
retires the `setActiveQueryClient` hand-off entirely. Keep thin deprecated
`shared*` exports (bound to a default context) during migration so tests can
be moved incrementally.

**Sequencing.** Do AFTER Task 1 (pipeline unification) — the pipeline is the
main consumer of these globals and unifying first means the injection happens
in one place, not three. Migrate one global at a time, full gate between
each: pluginFunctionRegistry → opRegistry → variableResolver → lexer →
currencyExchange. `sharedLexer` is last because `PackageSystem.register()`
writes lexer plugins into it at package-registration time.

## L2 — Unified reactive line-result store — PARTIALLY ADDRESSED (see below)

**Status 2026-07-22:** Task 8 shipped a narrower fix for the symptom this
item describes: `AsyncResolutionBatcher.onLineResult` mirrors resolved
async values into `DocumentModel.LineState.results` directly, so the view
plugin no longer has to mark lines dirty and re-run a full evaluator pass
just to copy a value from LineCache into DocumentModel. That removes the
worst cost (a redundant re-evaluation per async resolution) without the
"wide migration" this item calls for (grep `state.results`, `entry.result`,
`lineState.results` across ExpressionEngine, LineCache, DocumentModel,
ThreeTierEvaluator, AsyncResolutionBatcher, MarkdownEditorViewPlugin, and
the playground bridge). The full `ResultStore` unification below is still
worth doing — it removes the *need* for bridging callbacks like Task 8's
entirely — but is a maintainability project with no user-facing bug
attached, on top of a LineCache that was just rewritten (P2) and a
DocumentModel/AsyncResolutionBatcher that were just touched twice each
(Tasks 3, 6, 8). Give it its own session once the code has settled.

**Why.** Line results currently live in three stores (LineCache in the
engine, `LineState.results` in DocumentModel, TanStack Query for async) with
hand-written bridging (Task 8 adds a callback; the view plugin re-evaluates
on async events). Every new consumer multiplies the sync paths.

**Shape.** One `ResultStore` owned by the evaluator: keyed by lineId,
holding `{ values, errors, bytecodeRef, source: 'sync' | 'async' }`, with a
subscribe API. The engine writes to it (replacing LineCache's result role —
LineCache keeps only bytecode+reads/writes), the batcher writes async
patches to it, decorations and the playground subscribe. DocumentModel keeps
document structure (lineId/text/dirty) and drops its result fields.
Migration is mechanical but wide: grep `state.results`, `entry.result`,
`lineState.results`.

## L3 — Bundle diet and dependency audit — ✅ MOSTLY DONE (commit "perf: bundle diet")

**Status 2026-07-22:** Shipped: esbuild metafile + a post-build bundle-size
report (top-10 contributors by bundled size — not a CI budget gate, since
CI is explicitly out of scope for now); `moment` deduped against
Obsidian's bundled copy via `import { moment } from "obsidian"` (solve-js
never depended on moment at all, so the plan's "date-port injection"
concern didn't apply — only two `src/app` files needed the swap); the
unused `debug` dependency removed. Result: main.js 488KB → 428.7KB.

**Not done:** trimming `animate.css` to only-used keyframes. Investigation
found `ANIMATE_CSS_TRANSITIONS_OPTIONS` deliberately exposes ~90 of the
library's animations as a user-facing settings dropdown (only the
exit/"Out" variants are commented out) — trimming the stylesheet would
silently remove animations from that picker. Not a safe mechanical change;
if bundle size on this specific file matters later, the fix is a
build-time filter driven by that exact options list, not manual trimming.

**Why.** Runtime deps: `moment` (~230 KB min) while Obsidian ships its own
moment; `animate.css` imported wholesale; `debug`; `convert`;
`@tanstack/query-core`. The production main.js is ~550 KB — a large Obsidian
plugin.

**Shape.**
1. Add `metafile: true` to esbuild and check in a `scripts/bundle-report`
   step; record the baseline.
2. Replace direct `moment` imports inside `src/solve-js` with an injected
   date-port interface (solve-js must stay Obsidian-independent); the app
   layer supplies Obsidian's `moment`, the playground supplies the npm one
   as a devDependency.
3. Import only the used animate.css keyframes (or inline them in
   styles.css); drop `debug` in favor of the existing `logger`.
4. Budget assertion in CI: fail if main.js exceeds the recorded baseline
   by >10 %.

## L4 — CI adoption

ARCHITECTURE_PRINCIPLES.md §5 already specifies the workflows; they were
never created. Add `.github/workflows/test.yml` (push/PR: `npm ci`,
`tsc --noEmit`, default jest suite — it runs in ~7 s), `heavy.yml` (weekly:
fuzz/robustness/benchmark suites via the `test:oom` script), and
`release.yml` (tag → build → attach main.js/styles.css/manifest.json to the
release). Then **untrack `main.js` and `styles.css`** (they are already in
.gitignore but tracked, so every build dirties the diff) — releases become
the artifact channel, matching the .gitignore's stated intent.

## L5 — Value model hardening — ✅ DONE, option A (commit "feat: dev-mode Value immutability guard")

**Status 2026-07-22:** Shipped `freezeIfDev()` — freezes a Value in
development builds only, and only when the arena is inactive (an
arena-active Value may still be `recycle()`'d later in the same scroll
frame). Applied at the `evaluateLineDetailed()` boundary, the shared root
of `evaluateLine()`/`evaluateExpression()`. Caught a real pre-existing
issue immediately: `toNumber()` lazily memoizes `_cachedNumber` for
bigint/string values on first call, which would throw once frozen — fixed
by warming the cache before freezing. Verified by running the full suite
with `NODE_ENV=development` (exercises freezing) in addition to the
default run.

**Not done:** the ESLint half of option A. A syntax-only
`no-restricted-syntax` rule banning `.value =` assignment can't
distinguish a `Value` instance from the many unrelated `.value`-named
fields elsewhere in this codebase (`Token`, `EvalResult`,
`DiagnosticEvent`, ...) without type-aware linting (`parserOptions.project`
+ a type-aware rule), which is a heavier setup change out of scope for
this pass. The runtime guard is the enforcement mechanism for now.

**Why.** `Value` is documented immutable but is mutated by design in four
places (arena `recycle`, `timedOut` tagging, `entry.result` replacement,
`_cachedNumber` memo). The arena hands out objects that are recycled on the
next scroll frame — any consumer that retains one (widget, store, test)
holds a time bomb; today discipline is enforced only by comments.

**Shape.** Pick ONE:
- **A (cheap):** dev-mode-only `Object.freeze` on Values leaving the engine
  boundary (`evaluateLine*` returns, store writes) behind a
  `__DEV__`-style flag, plus an ESLint `no-restricted-syntax` rule banning
  assignment to `Value` fields outside `src/solve-js/src/vm/`. Catches
  violations in tests without production cost.
- **B (thorough):** make arena Values an internal-only type
  (`ArenaValue`), with `persistentValue()` conversion REQUIRED at every
  boundary, enforced by the type system (brand the arena type). Bigger
  change to VM signatures.
Start with A; consider B during L2 since the store is the natural boundary.

## L6 — Worker consolidation — ✅ DONE, scoped (commit "refactor: merge compilation and execution workers")

**Status 2026-07-22:** Shipped the file-merge (`engine.worker.ts` replaces
`compilation.worker.ts` + `execution.worker.ts` behind one
`self.onmessage` dispatching on `msg.type`) — ~200 lines of duplicated
postMessage/Transferable boilerplate removed, verified via a full
production build (confirms esbuild-plugin-inline-worker's filename-based
detection still transforms the merged file correctly).

**Not done:** unifying `CompilationWorkerManager` and `ExecutionPool` into
one `WorkerPool` class with shared size/timeout/fallback policy, as the
original spec describes. They intentionally kept their own pooling
policy (single lazy worker vs. N-worker round-robin + 30s timeout) — the
two have genuinely different needs, `ExecutionPool` has an extensive
existing test suite (~30 tests) tightly coupled to its current design, and
this is a "nice to have" with no correctness payoff. If pursued later, do
it as its own change with its own test-suite migration, not bundled into
a fast pass.

**Why.** `compilation.worker.ts` and `execution.worker.ts` duplicate the
Transferable-bytecode protocol, init/error handling, and pool management
(CompilationWorkerManager vs ExecutionPool, each with its own fallback
logic).

**Shape.** One `engine.worker.ts` speaking a discriminated-union protocol
(`{ kind: 'compile' } | { kind: 'execute' }`), one `WorkerPool` with
size/timeout/fallback policy, thin typed facades for the two call sites.
Deletes ~200 duplicated lines and gives one place to add future offloads
(e.g. Tier-3 batch evaluation).

## L7 — Structured error propagation — NOT ATTEMPTED

**Status 2026-07-22:** Not started. A version with real UI payoff (a
squiggle under the offending token) needs to thread a span type through
`LineEvaluation`, `DocumentModel`, and the decoration builder — the same
wide surface L2 touches, deferred for the same reason (settle the code
that was rewritten twice this session first). A narrower, purely additive
slice (add an optional `span` field to `SolveError` populated by the
parser, with no consumer required to change) was considered but produces
data nothing reads yet — better to do it together with the UI consumer in
one focused session than land unused plumbing now.

**Why.** Errors flow as bare strings (`ParsedLine.error`,
`LineState`/eval results, `EvalResults.errors`), losing the code, category,
and character span that `SolveError`/`ErrorFactory` already capture. The UI
can only show generic messages; it cannot underline the offending token.

**Shape.** Thread `SolveError` (or a serializable
`{ code, message, span? }`) through `LineEvaluation` (Task 5's type),
DocumentModel, and the decoration builder; add span info to parser errors
(PrecedenceParser knows the failing token's offset). Widget/tooltip renders
the message; a squiggle decoration marks the span. Do after Task 5 and L2 so
the error type rides the new result plumbing instead of the legacy fields.

---

## Deliberately NOT planned

- Merging `runEngine`/`runEngineWithStreaming` control flow (only their
  assembly logic — Task 4).
- Alternate evaluation backends / JIT — no evidence the VM is a bottleneck
  after the P1 fixes; revisit only with profiling data from L3's CI perf
  runs.
