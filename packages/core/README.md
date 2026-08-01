# @solve/core

The expression evaluation engine behind [Solve](https://github.com/LiamRiddell/obsidian-solve) — a
lexer, Pratt parser, bytecode VM, and an extensible package system for evaluating
natural-language-flavoured math expressions (`2 + 2 * 10`, `50% of 200`, `3 days + 4 hours`,
`10 USD to GBP`, `roll(1, 6)`, ...).

It ships as the framework-agnostic core of the Obsidian plugin, structured so it can be
embedded in any host application (editor plugin, CLI, desktop app, server) and extended with
domain-specific packages.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pipeline, package system, async
evaluation model, and caching layers fit together, plus a candid list of known
architectural debt.

## Installation

```bash
npm install @solve/core
```

## Quick start

```typescript
import { ExpressionEngine } from "@solve/core";

const engine = new ExpressionEngine("en");
const [value] = engine.evaluateExpression("2 + 2 * 10");

console.log(value.toNumber()); // 22
```

`evaluateExpression` throws an `EngineError` (see `@solve/core/errors`) on a parse or
evaluation failure — wrap calls with untrusted input in a `try`/`catch`.

For line-oriented input (e.g. a document made of multiple expressions, some referencing
variables defined on earlier lines), use `evaluateLine`/`parseDocument` instead — see the
`engine` subpath below.

## Formatting a result for display

```typescript
import { formatValue } from "@solve/core/format";

const [value] = engine.evaluateExpression("10 USD to GBP");
console.log(formatValue(value)); // uses DEFAULT_FORMATTING_SETTINGS if no settings passed
```

## Package structure

`@solve/core` exposes its API as a set of subpath exports, grouped by how stable/low-level
they are:

| Subpath | Purpose |
|---|---|
| `@solve/core` | Start here — `ExpressionEngine`, `PackageRegistry`/`packageRegistry`, `IEnginePackage`. |
| `@solve/core/engine` | `ExpressionEngine` and its supporting types (`LineEvaluation`, `EvalResults`, etc.) directly, without the package-registration wrapper. |
| `@solve/core/vm` | The bytecode VM: `Value`/`ValueType`, opcode dispatch, `allocatePluginFunctionIndex`. |
| `@solve/core/format` | Turning a `Value` into a display string (numbers, dates, units, vectors, ...). |
| `@solve/core/language` | Editor-agnostic language service: token categories, completions, highlighting. |
| `@solve/core/packages` | The built-in packages (arithmetic, datetime, time, dice, uom, currency, vector, conditionals, converters, mathphrases, ...). |
| `@solve/core/constants` | Engine configuration types and defaults (`EngineConfig`, `VMConfig`, ...). |

The following subpaths are **advanced-public** — everything a third-party package author
needs to extend the engine, but with a looser stability contract than the tier above (these
are the pieces the built-in packages and the [OSRS example](./examples/osrs) themselves
depend on):

| Subpath | Purpose |
|---|---|
| `@solve/core/lexer` | Tokenizer, `LexerVocabulary` for registering custom keywords/operators/units. |
| `@solve/core/parser` | Pratt parser, `BytecodeBuilder`, `OpCode`. |
| `@solve/core/normalizer` | Post-lexer token transforms (phrase fusion, implicit multiply). |
| `@solve/core/variables` | Variable resolution (`IVariableSource`). |
| `@solve/core/resolvers` | Async resolvers (`IAsyncResolver`) for data that loads asynchronously. |
| `@solve/core/errors` | `EngineError` and the error factory. |
| `@solve/core/utilities` | Small stateless helpers (e.g. `stripQuotes`). |
| `@solve/core/uom` | Units-of-measurement conversion tables and currency exchange. |
| `@solve/core/services` | Supporting services (query client construction, etc). |

Anything not listed above (`telemetry`, `cache`, `diagnostics`, `types`, `workers`) is
internal and not part of the package's public contract — it may change or disappear between
minor versions without notice.

## Authoring a package

A **package** (`IEnginePackage`) is a plain data descriptor bundling everything needed to
extend the engine with a new domain: custom tokens, parselets, VM opcode handlers, variable
sources, and optional async resolvers. See
[`@solve/core/api`'s `IEnginePackage`](./src/api/PackageRegistry.ts) for the full field list
with inline documentation and examples for each field.

Minimal shape:

```typescript
import { allocatePluginFunctionIndex } from "@solve/core/vm";
import type { IEnginePackage } from "@solve/core";

const MY_FN_IDX = allocatePluginFunctionIndex();

export const MY_PACKAGE: IEnginePackage = {
  name: "MyPackage",
  // engineVersion: "^0.1.0", // optional — see below
  prefixParselets: [{ tokenType: "MY_FUNC", parselet: new MyParselet() }],
  pluginFunctions: [{ index: MY_FN_IDX, handler: (args) => /* ... */ }],
};
```

Register it either as one of the packages passed to the `ExpressionEngine` constructor, or
at runtime via `ExpressionEngine.registerPackage()` / `unregisterPackage()`.

### Declaring engine-version compatibility

`IEnginePackage.engineVersion` is an optional semver range (e.g. `"^0.1.0"`) declaring which
`@solve/core` versions your package is built against. It's checked against the real, running
engine version at registration time. Omit it and your package always registers, exactly as
before this field existed — this is the default for every package that predates it. Declare it
once you want protection against the reverse case: your package being loaded into a much
newer (or much older) engine whose `IEnginePackage` contract has since changed shape.

Unlike every other compatibility signal in this codebase (see `ARCHITECTURE.md` §5.2's
sibling-package collision warnings, which always log and proceed), a declared range the
running engine does **not** satisfy causes `registerPackage()` to **throw**, not warn — see
`ARCHITECTURE.md` §5.3 for the full reasoning.

### Three more extension points, beyond `pluginFunctions`

- **`@solve/core/parser`'s `definePhrasePattern()`** — build a phrase-grammar parselet
  (`roll between X and Y`, `average of X, Y, Z`) from a declarative list of
  `{ slots, emit }` alternatives instead of hand-writing `parser.consume()`/
  `parseExpression()` calls. See `packages/mathphrases/` for several real examples, and
  its own JSDoc for the one hard constraint (every alternative must start with a keyword
  slot) and when a hand-written parselet is the right call instead.
- **`@solve/core/resolvers`'s `createQueryResolver()`** — a factory for the common
  "one cached async fetch → one `Value`" shape (weather, stock prices, a game-item price
  API — see `examples/osrs`), generalizing the caching/staleness plumbing so a package
  only needs to write the fetch call and the response mapping.
- **`IEnginePackage.asConverters`** — contribute a custom `as <name>` conversion (e.g.
  `50% as decimal`) to the built-in `converters` package's grammar: `{ myUnit: (value) =>
  /* ... */ }`. No lexer keyword registration needed — any bare word after "as" that isn't
  one of the built-in names resolves against this registry at runtime.

See `ARCHITECTURE.md`'s §5.1 for the full reasoning behind each, including a real
regression (and its fix pattern) worth reading before picking a keyword for your own
package: a colon-prefixed variable name (`:name = expr`) can never be a keyword-shaped
word in this engine, so a common-noun trigger word (like "total") should be phrase-fused
with its qualifying keyword rather than claimed bare.

Two runnable examples, both under [`examples/`](./examples) (example code, not part of the
published package — see `files` in `package.json`, only `dist/` ships):

- [`examples/basic`](./examples/basic) — the smallest complete package: one custom keyword
  (`reverse("text")`) dispatched through a plugin function, nothing else. Start here. Its
  test, [`__tests__/examples/basic/BasicPackage.spec.ts`](./__tests__/examples/basic/BasicPackage.spec.ts),
  shows the full register-and-evaluate loop end to end.
- [`examples/osrs`](./examples/osrs) — a fuller example covering everything `basic` leaves
  out: a phrase-fused multi-word item name, an async resolver backed by a real HTTP API, a
  custom highlight category, and completion items. Prices Old School RuneScape Grand Exchange
  items (e.g. `ge("Abyssal whip")`).

## Known limitations

**Cross-instance isolation is incomplete.** Several registries — the lexer vocabulary,
opcode registry, variable resolver, plugin-function registry, and currency exchange rates —
are shared module-level singletons rather than per-`ExpressionEngine` state. In practice this
is safe today because package registration is idempotent and the reference host (the Obsidian
plugin) registers the same built-in packages into every engine instance it creates. It would
**not** be safe to assume full isolation between two engines configured with genuinely
different package sets in the same process (e.g. two engines where one has a package
unregistered that the other still needs). This is a tracked architectural item (see
`plans/ARCHITECTURE_IMPROVEMENTS.md`, "L1 — EngineContext") and is a prerequisite for a 1.0.0
release; 0.x versions ship with this caveat disclosed rather than silently.

## Development

This package is developed inside the [obsidian-solve](https://github.com/LiamRiddell/obsidian-solve)
monorepo as an npm workspace (`packages/core`).

```bash
npm run build   # tsup — emits ESM + CJS + .d.ts to dist/
npm run dev     # tsup --watch
npm test        # standalone jest run, scoped to this package
```

## License

MIT — see [LICENSE](./LICENSE).
