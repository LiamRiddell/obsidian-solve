# AGENT.md

Guidance for AI coding agents (and human contributors) working in this repository.
This file is kept accurate against the real, current implementation — if you find a
claim here that's wrong, fix the claim, don't just work around it.

Related docs: [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) (code style rules),
[`ARCHITECTURE_PRINCIPLES.md`](./ARCHITECTURE_PRINCIPLES.md) (module boundaries),
[`PROJECT_ETHOS.md`](./PROJECT_ETHOS.md) (product philosophy),
[`packages/core/ARCHITECTURE.md`](./packages/core/ARCHITECTURE.md) (the engine's own
architecture doc, including a running punch list of known gaps).

---

## Error handling

This is the authoritative reference for how errors work in this codebase. It exists
because two earlier docs (`CODING_STANDARDS.md` §2, `ARCHITECTURE_PRINCIPLES.md`)
described a `SolveError` type and a per-category recovery-strategy dispatch
(`PARSING → SKIP`, `EXTERNAL → RETRY`, etc.) that were never actually implemented —
aspirational planning-doc content that drifted from what got built and sat there
looking authoritative. Don't reintroduce either of those.

### The three files

| File | Exports | Purpose |
|---|---|---|
| `packages/core/src/errors/EngineError.ts` | `EngineError`, `ErrorCategory`, `ErrorFactory`, `normalizeUnknownError` | The error type itself and how to construct one |
| `packages/core/src/errors/Result.ts` | `Result<T,E>`, `ok`/`err`/`isOk`/`isErr`/`map`/`mapErr`/`andThen`/`unwrapOr`/`match`/`combine`/`throwIfErr`/`tryCatch`/`tryCatchAsync` | A discriminated-union alternative to throw/catch, for the handful of places that use it |
| `packages/core/src/errors/ErrorCode.ts` | `CoreErrorCodes`, `ErrorCode` | The typo/collision-checked catalog of codes used by the parser/VM/engine/errors/config/lexer layers |

`packages/core/src/errors/UnifiedErrorFramework.ts` is a **backward-compatible
re-export barrel** — ~100+ call sites import from that exact path. It re-exports
everything from the three files above. Import from either path; don't invent a fourth.

Two things this codebase used to have and doesn't anymore: an `ErrorSeverity` enum and
a 5-value `ErrorRecovery` enum (plus an `ErrorRecoveryManager` class). Both were removed
as confirmed-zero-consumer dead code — if you're tempted to add a "severity" or
"recovery strategy" concept back in, read the next section first; there's a reason it
isn't there.

### `EngineError` anatomy

```typescript
class EngineError extends Error {
  readonly category: ErrorCategory;   // PARSING | VALIDATION | EXECUTION | EXTERNAL | INTERNAL | CONFIG
  readonly code: string;              // e.g. "UNDEFINED_VARIABLE" — see ErrorCode.ts
  readonly message: string;           // short, stable — existing assertions match on this
  readonly expected?: string;         // Rust/Go-style verbose detail (optional)
  readonly found?: string;
  readonly suggestion?: string;
  readonly recoverable: boolean;      // see "Constructing one: ErrorFactory" below for what this actually gates
  readonly span?: SourceSpan;         // character-offset span into source, when available
  readonly context?: Record<string, unknown>;  // readonly — see "Preserve the original error" below
  readonly cause?: unknown;           // the wrapped underlying error, if any
  readonly timestamp: Date;

  isFatal(): boolean;   // !recoverable
  format(): string;     // multi-line "error[CODE]: message\n  expected: …\n  found: …\n  suggestion: …"
  causeChain(): unknown[];
  toJSON(): Record<string, unknown>;
}
```

`.message` is what existing tests assert against and what the inline editor result
display shows (`format/FormatEngine.ts`'s `ValueType.Error` case) — keep it short and
stable. `.format()` is for contexts that want the full picture: a thrown/uncaught error,
a console log, a devtools/diagnostic panel. Don't conflate the two.

### Constructing one: `ErrorFactory`

Six static methods, two call shapes each:

```typescript
// Minimal — code, message, optional context object
throw ErrorFactory.parsing('UNEXPECTED_TOKEN_TYPE', `Expected NUMBER, got ${token.type}`, { token });

// Richer — for expected/found/suggestion detail
throw ErrorFactory.validation({
  code: 'EXPRESSION_TOO_LONG',
  message: `Expression exceeds max length of ${max} characters`,
  expected: `at most ${max} characters`,
  found: `${expr.length} characters`,
  context: { length: expr.length, max },
});
```

| Method | `recoverable` default | Use for |
|---|---|---|
| `.parsing()` | `true` | Lexer/parser failures — malformed syntax, unmatched tokens |
| `.validation()` | `true` | Input rejected by a safety check (too long, too complex) |
| `.execution()` | `true` | VM runtime failures reachable from ordinary, valid-looking user input (undefined variable, safety-limit exceeded, arity mismatch) |
| `.external()` | `true` | A third-party API/network call failed (weather, currency, crypto fetches) |
| `.internal()` | `false` | An engine-internal invariant violation — "this should be unreachable," a caller-contract violation, corrupted bytecode, a bug |
| `.config()` | `false` | A registration-time/host-configuration problem (a plugin's keyword collides with a built-in one, an opcode/index pool exhausted) |

**The dividing line for `recoverable` is "user error vs. engine-internal invariant
violation" — full stop.** It is explicitly **not** about whether evaluation of the rest
of the document continues, and not a dispatch table mapping category to a recovery
action. With this engine's per-line/per-batch containment (see below), evaluation of
everything else **always** continues regardless of a given error's category or
`recoverable` value. The flag exists purely for **message framing and telemetry**:
"fix your syntax" vs. "this is an engine bug, worth reporting" (`EngineError.isFatal()`).
Concretely: `f(x) = f(x)` (infinite recursion) hits `FUNCTION_RECURSION_LIMIT_EXCEEDED`
via `.execution()` — `recoverable: true`, because it's an ordinary user mistake, even
though the safety-limit *mechanism* exists to stop something that would otherwise be
uncatchable (a native stack overflow). Meanwhile `GLOBAL_VARIABLE_NOT_RESOLVED` (a
global read before an async preflight that's *supposed* to guarantee it ran — reachable
only via a confirmed, disclosed bypass in `ThreeTierEvaluator`'s Tier-2 fast path, not
by anything a user's expression can trigger directly) uses `.internal()` —
`recoverable: false`, because the precondition violation is the caller's fault, not the
user's.

When in doubt: could a user hit this by typing a plausible, if wrong, expression? →
`.parsing`/`.validation`/`.execution`/`.external`. Could this only happen if some other
part of the engine already violated its own contract? → `.internal`/`.config`.

### `Result<T, E>` — when it's used, when it isn't

Most of this codebase still throws normally — parselets, most of the parser, most
package code. `Result<T,E>` shows up at specific **boundaries** where a caller wants to
inspect a failure without a try/catch:

- `vm/VM.ts`'s `EvalResult = {type:'value'} | {type:'pending'} | {type:'error', error: EngineError}` — what `executeBytecode()` returns.
- `engine/ExpressionEngine.ts`'s private `prepareExpression()` — an internal discriminated union (`{kind:'empty'|'error'|'ready', ...}`) shaped like `Result` but with a third "empty" arm; callers `throw prep.error` rather than letting it propagate raw.

Don't go rewrite an arbitrary throwing function into `Result<T,E>` on spec — it's a real
architectural change (return-type signature change, every caller updated) with a real
blast-radius, and most of this codebase's throwing functions don't need it. Reach for it
when you're adding a NEW boundary where a caller genuinely needs to branch on
success/failure without try/catch overhead, not as a blanket style preference.

### Adding a new error code

1. **Core layers** (parser, VM, engine, errors, config, lexer — the files listed in
   `__tests__/errors/ErrorCodeCatalog.spec.ts`'s `CATALOGED_FILES`): add it to
   `CoreErrorCodes` in `errors/ErrorCode.ts`, with a one-line doc comment explaining what
   triggers it. `ErrorCodeCatalog.spec.ts` enforces uniqueness and scans those files for
   any `ErrorFactory.<method>("CODE", ...)` call using a code that isn't in the catalog
   (an "orphan") — **run this test after adding or renaming any error code** in those
   files, it will catch typos and forgotten catalog entries immediately.
2. **Domain packages** (`packages/core/src/packages/*`, plus `uom/`): the core catalog
   deliberately doesn't cover these yet (`IEnginePackage` is public SDK surface — a
   closed enum would block a third-party package author from defining their own codes).
   Instead, export a small co-located `XxxErrorCodes` const object next to the package,
   same shape as `CoreErrorCodes` just scoped to one domain — see `WeatherErrorCodes`
   (`packages/weather/OpenMeteoClient.ts`) and `CurrencyErrorCodes`
   (`uom/CurrencyExchange.ts`) for the pattern. These aren't orphan-checked yet, so double
   check the code string manually.
3. Never hand-roll a string literal with no catalog entry anywhere — that's exactly what
   the orphan check exists to catch.

### Per-line / per-batch containment — the rule that actually matters most

**Any loop that iterates multiple document lines or multiple batch items must contain
each iteration's failure and continue — never let one item's failure abort the rest.**
This is the single most important rule in this file. Two confirmed fatal bugs of exactly
this shape were found and fixed in this codebase (2026-08):

1. `AsyncResolutionBatcher.reExecuteMainThread()` had a `for` loop over multiple
   resolved-async-value lines calling `executeBytecode()` with **no try/catch anywhere
   in the call chain**, running inside a bare `queueMicrotask` with no caller able to
   catch an escaping exception — one line's failure could silently drop every
   subsequent line in the batch, or crash the host process outright via an uncaught
   exception.
2. `ExpressionEngine`'s constructor looped over packages calling `registerPackage(pkg)`
   with no try/catch — a single package whose `lexerVocabulary` collided with a
   built-in keyword/operator/unit threw straight out of the constructor, meaning `new
   ExpressionEngine(...)` never returned an instance at all, and every package listed
   after the offender never registered either.

The fix shape is the same both times: wrap each iteration's work in its own try/catch
(or, if the callee returns an `EvalResult`-shaped value instead of throwing, check
`result.type === 'error'`), record that ONE item's failure (as an `errorValue()` for a
document line, or a `console.error` + skip for a package), and `continue` — never let it
propagate past that one iteration. **A gap here is a fatal-crash bug, not a style nit —
audit any new loop over multiple lines/items with this in mind.**

### Preserve the original error — don't flatten-then-reconstruct

A caught `EngineError` carries its specific `code` and (sometimes) `expected`/`found`/
`suggestion` detail. A generic wrapper you construct around just its `.message` string
throws all of that away. This was a real, shipped bug: `ExpressionEngine.evaluateLine()`
used to catch whatever specific error a parselet threw (e.g.
`CLAMP_EXPECTED_BETWEEN_OR_FROM`), reduce it to its message, and re-throw a brand-new,
generic `EVALUATION_ERROR` wrapper — so a caller could never see the real code, only the
generic one. Fixed by threading the real `EngineError` through instead of just its
message (see `prepareExpression()`, `evaluateExpressionWithDiagnostic()`,
`evaluateLineDetailed()` in `engine/ExpressionEngine.ts`).

```typescript
// ❌ Wrong — discards the original code/category/expected/found/suggestion
} catch (e) {
  throw ErrorFactory.execution('EVALUATION_ERROR', e instanceof Error ? e.message : String(e));
}

// ✅ Correct — preserve it
} catch (e) {
  throw normalizeUnknownError(e);
}
```

If you need to **add** context (not replace) to a caught error before re-throwing:
`EngineError.context` is `readonly`, so you can't mutate it in place. Construct a new
`EngineError` copying every other field through:

```typescript
throw new EngineError(original.category, {
  code: original.code,
  message: original.message,
  expected: original.expected,
  found: original.found,
  suggestion: original.suggestion,
  recoverable: original.recoverable,
  span: original.span,
  cause: original.cause,
  context: { ...original.context, lineNumber },
});
```

(See `ExpressionEngine.compileExpression()`'s parse-error branch for the real example —
it merges in already-extracted `reads`/`writes` this way, for `ThreeTierEvaluator`'s
DAG-tracking on a compile failure.)

### Never `throw new Error(...)`

As of 2026-08, there are **zero** raw `throw new Error(...)` sites anywhere in
`packages/*/src` or `src/app`, except `packages/core/src/workers/engine.worker.ts`'s
build-time `esbuild-plugin-inline-worker` sentinel (the whole file is replaced by the
bundler plugin before it ever runs, so that throw is unreachable at runtime — leave it).
Keep it that way: use `ErrorFactory.<category>(code, message, context?)` for anything
new, per the "Adding a new error code" section above.

### Verification checklist after touching anything error-related

1. `npx jest packages/core/__tests__/errors/ErrorCodeCatalog.spec.ts` — if you touched a
   core-layer error code (see `CATALOGED_FILES` in that test).
2. `npx tsc --noEmit --skipLibCheck` from `packages/core/`.
3. `npx jest --no-coverage` from the repo root — watch for
   `AllocationTracker.spec.ts`'s one pre-existing, known-flaky GC-timing test; re-run it
   alone if it fails and nothing else did, it usually passes in isolation.
4. `npx tsup` from `packages/core/`.
5. `node esbuild.config.mjs production` from the repo root.

### Canonical files to read before making changes here

- `packages/core/src/errors/EngineError.ts` — the type and factory, in full.
- `packages/core/src/vm/VM.ts` — `safePop()` and the `LOAD_GLOBAL_VAR` case are the
  clearest examples of `.internal()` used correctly (both are caller-contract
  violations, not user errors); `unwrapEvalResult()` shows the three-way `EvalResult`
  dispatch.
- `packages/core/src/engine/AsyncResolutionBatcher.ts`'s `reExecuteMainThread()` — the
  canonical per-batch containment pattern, with its own doc comment explaining the bug
  it fixes.
- `packages/core/src/engine/ExpressionEngine.ts`'s `prepareExpression()` and
  `registerPackage()`/constructor — the canonical "preserve the original error" and
  "per-item containment in a non-per-line loop" patterns respectively.
