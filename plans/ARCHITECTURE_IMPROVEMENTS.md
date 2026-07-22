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

## Task 1 — Unify the triplicated evaluation pipeline in ExpressionEngine

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

**Options (pick one with the project owner before implementing):**
- **A (recommended):** Return `null` unless a live rate is cached
  (`RateCache`-style store fed by `getRate`); expression shows Pending →
  resolves when the fetch lands. Delete the hardcoded table.
- **B:** Keep fallbacks but tag the resulting Value (`approximate: true`
  metadata, like `timedOut`) and render an indicator in the widget/playground.
- **C:** Keep table but move it to user-visible settings ("offline rates").

Whichever is chosen: `__tests__/uom/CurrencyExchange.spec.ts` currently
asserts the fallback behavior and must be updated deliberately.

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

## Task 9 — Typed batcher metrics (small)

`ExpressionEngine.getBatcherMetrics()` reads `(this.batcher as any).pending`
etc. Add read-only accessors on `AsyncResolutionBatcher`
(`get pendingCount()`, `get listenerCount()`, `get workerOffloadCount()`) and
use them. Delete the `as any` casts. Pure mechanical change; existing
`AsyncResolutionBatcher.spec.ts` sections cover the metric values.

---

## Deliberately NOT planned

- Replacing the shared `sharedLexer` global — too entangled with
  PackageSystem registration order; revisit after Task 3 ships.
- Merging `runEngine`/`runEngineWithStreaming` control flow (only their
  assembly logic — Task 4).
- Swapping `moment` for Obsidian's bundled moment — worth doing for bundle
  size, but verify the engine (`src/solve-js`) stays Obsidian-independent;
  would need a date-adapter injection at the app layer.
