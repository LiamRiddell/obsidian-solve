# Engine iteration log

**Product goal**: build the SDK/engine that "destroys" the competition in this category —
SoulverCore, Numi, Notes Calculator, Numbr, NumPad, Calculo, and whatever comes next. Not a
one-time feature-parity pass: a standing practice of researching what these apps do, honestly
assessing what this engine can and can't already do, closing the gaps that are tractable now,
and recording — in markdown, kept current, not left to rot — exactly what's blocked and why for
everything that isn't. `packages` is the mechanism; the engine underneath it, its speed, and its
extensibility are the actual product.

This file is the **narrative log** — one dated entry per research/build iteration, short, linking
out to the detailed artifacts rather than duplicating them. It answers "what happened, in what
order, and why" for a future session or reviewer; the linked docs answer "what's the exact,
current status of feature X."

**Companion documents** (the detailed, kept-current status — read these for specifics, not this
file):
- [SOULVERCORE_FEATURE_AUDIT.md](./SOULVERCORE_FEATURE_AUDIT.md) — SoulverCore, page-by-page.
- [OTHER_APPS_FEATURE_AUDIT.md](./OTHER_APPS_FEATURE_AUDIT.md) — Numi, Notes Calculator, Numbr,
  NumPad, Calculo (inaccessible) — includes the three confirmed, unimplemented engine
  limitations with root causes and design sketches (cross-line data access, user-defined
  functions, dynamic unit-ratio reconfiguration).
- [ARCHITECTURE.md](./ARCHITECTURE.md) — the engine's actual structure, the SDK extension points
  (§5.1-5.2), and the standing punch list of architectural debt (§12).

---

## 2026-08-01 — SoulverCore feature-parity pass

Full page-by-page audit against SoulverCore's documentation site (all Documentation +
Syntax Reference pages). Result: 39/40 calculation features implemented across new/extended
packages (`time`, `conditionals`, `converters`, `mathphrases`, `finance`, `weather`, `stocks`,
`knowledge`, plus completions to `datetime`/`uom`/`arithmetic`), 1 deliberately deferred
(totals-and-subtotals' cross-line aggregation — see the engine-limitations writeup below, since
it turned out to be the SAME root cause several later apps also hit). Four new SDK extension
points shipped along the way, each because a real package needed it, not speculatively:
`PhrasePattern`, `createQueryResolver`, `IEnginePackage.asConverters`,
`LexerVocabulary.rawLinePatterns`. Full detail: [SOULVERCORE_FEATURE_AUDIT.md](./SOULVERCORE_FEATURE_AUDIT.md),
[ARCHITECTURE.md](./ARCHITECTURE.md) §5.1.

**Process lesson, not a feature**: `isolation: "worktree"` doesn't isolate `packages/core` when
it's uncommitted (a git worktree only ever contains committed content) — three parallel agents
ended up mutating the same shared checkout with no real filesystem isolation, and independently
collided on the same `CALL_BUILTIN` plugin-function indices twice. Fixed by hand during merge;
directly motivated the package-compatibility-checker work below, since that exact collision
class (two packages claiming the same numeric index) is now caught automatically at `error`
severity the moment either package is registered, instead of requiring a human to notice during
a merge.

## 2026-08-01 — Numi, Notes Calculator, Numbr, NumPad, Calculo

Same audit method, extended to the wider "calculator notepad" category beyond SoulverCore
specifically — Numi and Notes Calculator first (both have real, exhaustive public syntax
references), then Numbr and NumPad added mid-pass at the user's direction, Calculo attempted
but its only documentation-shaped URL (`/templates`) returns HTTP 403 (noted as inaccessible,
not silently skipped).

**Shipped** (nine items, all using existing engine primitives — no new VM surface area needed):
octal literal input (`0o17`; hex/binary already worked, octal had zero handling anywhere),
`arcsin`/`arccos`/`arctan` long-form aliases, `root(n, x)`, `fact`/`factorial`, `KiB`/`MiB`/
`GiB`/`TiB` binary-prefix data units (the underlying `convert` package already knew these
natively — a pure lexer-allowlist gap), three percentage solve-for-the-unknown forms (`N% of/
on/off what is X`), and `¥`/`₽`/`₩` currency symbols. Full detail with exact file/line
references: [OTHER_APPS_FEATURE_AUDIT.md](./OTHER_APPS_FEATURE_AUDIT.md).

**Confirmed, NOT shipped — three real engine limitations**, each with a concrete root cause and
a design sketch (not a vague "not supported"), because forcing these through as a rushed
package-level addition would have produced something broken or misleading:

1. **Cross-line data access** — blocks `prev` (Numi), `line<N>`/ranges (Notes Calculator,
   NumPad — `sum(line 1 : line 4)`), and cross-line `sum`/`total`/`average` (Numbr, and
   SoulverCore's own totals-and-subtotals from the earlier pass). **Confirmed by FOUR
   independent apps** wanting the exact same missing primitive — by a wide margin the
   highest-leverage single architecture investment identified so far. Root cause:
   `pluginFunctions` handlers have signature `(args: Value[]) => Value`, zero execution
   context (no line number, no `DocumentModel` access). Design sketch: an optional
   `LineExecutionContext` threaded through `CALL_PLUGIN`'s dispatch, sourced from
   `DocumentModel.getLineAt()`. Effort: MEDIUM.
2. **User-defined, parameterized, reusable functions** (Notes Calculator: `f(x) = 2*x + 1`,
   then `f(5)` → `11`, composable — `double(double(5))`). Root cause: `BytecodeBuilder`
   compiles each line to ONE flat, single-use program; there's no concept anywhere of a
   named, reusable, parameterized sub-program with its own call frame (built-in functions
   are fixed-arity native JS closures, not user-authored bytecode). Design sketch: a new
   `CALL_USER_FUNCTION` opcode, a per-engine `{name -> {params, program}}` registry, and a
   minimal parameter-binding call-frame mechanism. Effort: LARGE — genuine new VM primitive,
   not a package built on existing extension points.
3. **Dynamic unit-ratio reconfiguration** (Numi: `ppi = 326` changes what `em`/`px` mean for
   the rest of the session). Root cause: the entire unit system is a static, module-load-time
   table; no assignment can mutate a unit's conversion ratio at runtime. Design sketch: a
   per-engine (never module-global — would reopen the L1 cross-instance-isolation gap,
   `ARCHITECTURE.md` §10) mutable ratio-override map, checked before the static tables.
   Effort: SMALL-MEDIUM, but LOW PRIORITY — no other app in this audit wants it.

## 2026-08-01 — Package compatibility checking (`api/PackageCompatibility.ts`)

Not a feature-parity item — a direct response to "packages should have load-up resiliency and
compatibility checks to detect issues with overlapping logic." Built `checkPackageCompatibility()`:
a pure, static function comparing one package's declared fields against every other registered
package's, across every collision-capable field `IEnginePackage` has (parselet token types,
phrases, `asConverters` names, `pluginFunctions` indices, lexer keywords/operators, async-resolver
namespaces, token categories) — returning a structured `error`/`warning`/`info` report. Wired into
`ExpressionEngine.registerPackage()` so it runs automatically on every registration (non-blocking,
matching this codebase's established warn-and-proceed convention), not just available as an
opt-in call a host has to remember to make. Full detail: `ARCHITECTURE.md` §5.2.

Directly motivated by two real incidents from the SAME session's earlier work: three parallel
agents independently claiming the same plugin-function index (now an automatic `error`), and the
currency package's real descriptor drifting out of sync with its own parallel test-harness helper
(a different, source-consistency bug class this checker does NOT catch — noted honestly in its
own module doc rather than overclaiming coverage). Verified with a regression guard that runs the
checker against the REAL, live `BUILTIN_PACKAGES` array (not just synthetic fixtures) and asserts
zero `error`-severity conflicts exist today.

**Open follow-up, not yet started**: this checker only runs at package-registration time and only
compares DECLARED fields. It cannot catch semantic overlap two packages don't declare in a
structured way — e.g. two packages both claiming a similar-sounding NATURAL-LANGUAGE phrase
that doesn't collide exactly (a near-miss, not an exact-string collision the `phrases` check
catches) would slip through. Worth a future pass once there are enough third-party packages in
the wild to make near-miss detection worth the false-positive-rate tuning it would need.

## 2026-08-01 — Calca research, the registration-drift bug class killed for good

**Calca** (`calca.io/reference`) turned out to be a different kind of product — full
symbolic-math/CAS (matrices, complex numbers, symbolic calculus, general equation solving), not a
natural-language numeric calculator like every other app audited so far. Explicit product
direction: chase 100% parity anyway, including consolidating `Vector2`/`Vector3`/`Vector4` into a
general matrix type and treating Calca's syntax as a floor, not a ceiling. Full 6-phase roadmap in
[OTHER_APPS_FEATURE_AUDIT.md](./OTHER_APPS_FEATURE_AUDIT.md)'s new Calca section. The single most
important finding from this research: `der()`/`taylor()`/`jacobian()`/`x => ...`/`map`/`reduce`
all reduce to the SAME missing primitive — user-defined, parameterized, callable functions
(originally surfaced from Notes Calculator, previously scoped as one nice-to-have among several)
— which reprioritizes it to Phase 1, the first concrete build in this roadmap, in progress now.

**A live, real bug class was found and killed structurally, not just detected**, while double-
checking the compatibility checker's own stated blind spot: three built-in packages (`finance`,
`uom`, `variables`) had their real `IEnginePackage` descriptor silently out of sync with a
parallel hand-written `register{Domain}Parselets()` test-harness helper — the exact class the
`currency` package hit earlier this session, now confirmed to have happened FOUR times total.
Per explicit direction ("fix this and make sure it never happens again"): rather than adding a
drift-detection test on top of the duplication, all 15 packages' hand-written registration
functions were deleted outright and replaced with one generic, descriptor-driven
`registerPackageForTesting(pkg, registry)` (`tools/testUtils.ts`) — 47 files touched (15 source +
32 test/benchmark/integration files), full suite re-run clean afterward (156 suites, 3384 tests),
confirming the swap silently fixed all three live drifts as a side effect (finance/uom/variables's
isolated specs now reach token types they silently couldn't before) with nothing relying on the
old unreachable behavior. A new `RegistrationPathParity.spec.ts` both re-verifies every package's
descriptor-vs-registered-token-type parity and scans the whole `packages/` tree to fail outright
if a future package ever reintroduces a bespoke registration function — this bug class is now
structurally impossible, not just monitored.
