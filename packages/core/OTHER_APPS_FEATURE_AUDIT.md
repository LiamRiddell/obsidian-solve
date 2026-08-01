# Feature parity audit: other "calculator notepad" apps

Companion to [SOULVERCORE_FEATURE_AUDIT.md](./SOULVERCORE_FEATURE_AUDIT.md), which covers SoulverCore
specifically. This document extends the same page-by-page, evidence-based audit method to
every other app in the category researched so far — always from the app's own published
documentation, not guessed from memory:

- **[Numi](https://numi.app/)** (`nikolaeu/numi`, macOS/Windows/Linux) — full syntax reference
  fetched from its [GitHub wiki](https://github.com/nikolaeu/numi/wiki).
- **[Notes Calculator](https://notescalculator.com/)** (Windows/Mac/Linux/browser) — full docs
  site at [docs.notescalculator.com](https://docs.notescalculator.com).
- **[Numbr](https://github.com/antonmedv/numbr)** (`antonmedv/numbr`) — full syntax reference at
  its [DOCS.md](https://github.com/antonmedv/numbr/blob/master/DOCS.md).
- **[NumPad](https://numpad.io/)** — full syntax reference at
  [docs.numpad.io/calculator-features.html](https://docs.numpad.io/calculator-features.html).
- **[Calculo](https://www.calculo.tech/)** — checked, **inaccessible**: its `/templates` page
  (the only documentation-shaped URL found) returns HTTP 403. No other public syntax reference
  located. Not audited for this reason, not skipped.
- **[Calca](https://calca.io/reference)** — full syntax reference at `calca.io/reference`. A
  qualitatively different product from every app above (full symbolic-math/CAS, not a
  natural-language numeric calculator) — see its own dedicated section below rather than the
  per-feature ✅/❌ table the other apps use, since "100% parity" here means a multi-phase
  roadmap, not a quick feature check.
- A few other named alternatives (WUJI, Parsify) were checked but have no public syntax
  reference detailed enough to audit at all — Product Hunt/blog comparison pages describe them
  in a sentence or two each, with no documentation site.

Status legend matches the SoulverCore audit: ✅ implemented, ⏸️ deliberately deferred (scoped
reason given), ❌ **confirmed engine limitation** (root cause + a concrete design sketch for a
future fix — this is the category the user asked this document to capture for future planning).

Last updated: 2026-08-01.

---

## Numi — full syntax reference cross-check

| Feature | Status | Notes |
|---|---|---|
| Unit conversion (`value in/to unit`) | ✅ | `packages/uom/`. |
| Time zone conversion | ✅ | `packages/time/timezones/`. |
| Operators (`+ - * / ^ & \| xor << >> mod`) | ✅ | `packages/arithmetic/` + bitwise (pre-existing). |
| Hex/binary literal input (`0xFF`, `0b1010`) | ✅ | Pre-existing (`ExpressionLexer.ts`). |
| **Octal literal input (`0o17`, `0O17`)** | ✅ **added this pass** | Was a real, confirmed gap — `0x`/`0b` prefixes were lexed, `0o` had zero handling anywhere. Added to `ExpressionLexer.ts`'s number scanner, `PrecedenceParser.ts`'s NUMBER_ID fast path, and `NumberParselet.ts`'s mirrored copy (all three needed updating in lockstep, per that file's own doc comment about why it's a dead-code-but-must-stay-synced copy). |
| Scientific notation | ✅ | Pre-existing, plus `as sci` converter for output. |
| Currency (fiat + crypto) | ✅ | `packages/currency/`. |
| Percentages: `X% of Y`, `X% on Y` (add), `X% off Y` (subtract) | ✅ | `packages/percentage/` (`of`, `increase X by Y%`/`decrease X by Y%` cover the add/subtract forms with different wording). |
| Percentages: `X% of what is Y` (solve for the base) | ✅ **added this pass** | Confirmed as a genuine gap — no "solve for the unknown" percentage form existed. New `OfWhatIsParselet.ts`, phrase-fused as `"of what is"` (not a bare `what` keyword, matching this codebase's variable-collision policy) — computes `Y / percent` via a `SWAP` + `DIV` bytecode sequence (the percent value is already on the stack as the left operand by the time the infix parselet runs). NumPad's docs additionally confirmed the sibling forms `N% on what is X` / `N% off what is X` (solve for the base given a percentage increase/decrease RESULT, not a plain product) — also added, `OnOffWhatIsParselet.ts`, same technique with an extra `1 ± percent` step. |
| Large-number scales (`k`, `M`/`million`, `billion`) | ✅ | `2.5k`/`5M`/`10G`/`20T` suffix normalizer (this session). Numi doesn't have abbreviated `G`/`T` forms — a minor syntax difference, not a gap. |
| Variables (`name = value`, bare, no prefix) | ⚠️ design difference, not a gap | Numi's variables need no marker at all. This engine deliberately requires `:name = value` — a *tested, intentional* policy (see `VariableParselet.ts`'s doc comment and the "reserved-keyword regression" test) that exists specifically to avoid the keyword-collision class this session hit repeatedly (`:total`, `:average`, etc. breaking when a package tried to claim the bare word). Adopting Numi's bare-word style would reopen every one of those collisions at once. Not something to change without deliberately revisiting that whole policy — noted here, not queued as a fix. |
| Constants `Pi`, `E` | ✅ | Both already registered (`ArithmeticPackage.ts`). |
| Functions: `sqrt`, `cbrt`, `log`, `ln`, `fact`, `round`, `ceil`, `floor`, `abs`, `sin/cos/tan`, `arcsin/arccos/arctan`, `sinh/cosh/tanh` | ✅ (after this pass) | `sqrt/log/round/ceil/floor/abs/sin/cos/tan/asin/acos/atan/sinh/cosh/tanh/cbrt` were already present under their short names. **`arcsin`/`arccos`/`arctan`** (long-form aliases) and **`fact`/`factorial`** (factorial — genuinely missing, not just a naming gap) were added this pass, plus **`root(n, x)`** (the general n-th-root form Numi documents as `root n (x)`) since only the fixed `cbrt` (n=3) case existed before. |
| CSS units (`px`, `pt`, `em`) with a user-settable global ratio (`ppi = 326`) | ❌ **engine limitation** | See "Confirmed engine limitations" below — item 3. |
| Date/time (`fromunix(...)`, `1 month in days`) | ✅ | Covered by this session's datetime-completions work (`<timestamp> to date`, magnitude-based ms/s disambiguation) — different call syntax, same capability. |
| SI prefixes (`mm`, `GB`, case-sensitive) | ✅ | Pre-existing `knownUnits` table. |
| **Binary-prefix (IEC) data units — `KiB`/`MiB`/`GiB`/`TiB`** | ✅ **added this pass** | Confirmed gap: the `convert` npm package this engine already depends on natively recognizes `KiB`/`MiB`/`GiB`/`TiB`/`PiB` (confirmed via its generated type definitions) — this was purely a `lexer/units.ts` allowlist omission, not a conversion-logic gap. Added directly. |
| `sum`/`average` across all lines above until a blank line | ✅ **added this iteration** | `total above`/`sum above`/`average above` — see item 1 below, now shipped as `packages/lines/`. |
| `prev` — reference the immediately-preceding line's result | ✅ **added this iteration** | See item 1 below — shipped as part of `packages/lines/`'s cross-line data access work. |
| Data units, bits vs bytes (`b` vs `B`) | ✅ | Pre-existing. |
| `#` headings, `"text"`/`// text` comments, `label:` | ✅ (mostly) | `#` headings and `//` comments both confirmed already implemented (`Comments.spec.ts`). A bare quoted string as a whole-line "comment" isn't specially treated, but doesn't error either — it just evaluates as a String value, a cosmetic difference not worth engineering around. `label:` (a named-line marker distinct from `:var =`) has no equivalent — low value, not investigated further (its use case is almost fully covered by variables already). |
| JavaScript plugin/extension API (`numi.addUnit()`, `numi.addFunction()`) | ⚠️ different SDK shape, not a gap | Numi's extensions are runtime JS files dropped in a folder; this engine's `IEnginePackage` is a typed, compile-time TypeScript descriptor (`pluginFunctions`, `asConverters`, `phrases`, `normalizerRules`, `rawLinePatterns`, ...). Different tradeoffs (Numi: no rebuild needed, no type safety; this engine: type-checked, needs a build step) — not a capability gap either direction. |

## Notes Calculator — novel items beyond SoulverCore overlap

Notes Calculator's documented feature set (Variables, Totals & Subtotals, Dates & Times,
Headings & Comments, Large Numbers, Line References, Operators, Functions, Constants,
Conditionals, Percentages, Rounding, Bases & Scientific Notation, Unit/Currency conversion) is
almost entirely a close structural match to SoulverCore's own — already covered by
[SOULVERCORE_FEATURE_AUDIT.md](./SOULVERCORE_FEATURE_AUDIT.md). Two items stood out as genuinely
new, checked directly against its docs:

| Feature | Status | Notes |
|---|---|---|
| **`line<N>` / `l<N>` — reference any line's result by absolute number** (`line1 + line2`, case-insensitive, `l1` short form) | ✅ **added this iteration** (glued `line1` and spaced `line 1`; bare `l1` short alias deliberately deferred — see `packages/lines/normalizer/LineRefNormalizerRule.ts`'s doc comment) | The MORE general form of Numi's `prev` above — same root cause, see item 1 below, now shipped as `packages/lines/`. |
| **User-defined functions** (`f(x) = 2*x + 1`, then `f(5)` → `11`; multi-parameter, composable, works with units/currency) | ✅ **added this iteration** | See item 2 below — Calca Phase 1, shipped. |

## Numbr — novel items beyond Numi/Notes Calculator overlap

Numbr's feature set is small and mostly already covered by the two audits above. Three items
worth calling out:

| Feature | Status | Notes |
|---|---|---|
| **Currency symbols `¥`, `₽`, `₩`** (beyond the existing `$`/`£`/`€`) | ✅ **added this pass** | Confirmed gap: the lexer had dedicated handling only for `$`/`£`/`€` — `¥`/`₽`/`₩` fell into the generic "unknown Unicode" bucket (silently became an IDENT token, or in some code paths were invisible to the "does this line look like an expression" classifier entirely). Added matching `YEN`/`RUBLE`/`WON` token types, lexer recognition (mirroring `POUND`/`EURO`'s exact pattern in both the fast-path and fallback tokenizer branches, plus `EXPRESSION_INDICATOR_CODES`), and `CurrencySymbolParselet.ts`'s `symbolToCurrency` map (`¥`→JPY, `₽`→RUB, `₩`→KRW — `¥` is genuinely ambiguous between JPY/CNY; JPY matches convention). **Caught and fixed a real bug in the process**: `CurrencyPackage.ts` (the real, shipped `IEnginePackage`) and `packages/currency/parselets/index.ts`'s `registerCurrencyParselets()` (a *separate*, parallel registration path used only by the isolated test harness) had drifted out of sync before — the new symbols were wired into one but not the other, caught immediately by a real test failure. This exact class of bug — two independent registration paths for the same package silently diverging — is precisely what the package-compatibility-checking work below is meant to catch automatically instead of by accident. |
| Bare `x` as a multiplication operator (`2 x 3`) | ❌ **declined, not a gap** | Deliberately not implemented: unlike `×` (U+00D7, unambiguous), bare ASCII `x` is one of the most overloaded characters in any expression language — a coordinate/variable name (`x = 5`), an implicit-multiply-adjacent identifier (`2x`), and now a proposed operator, all at once. Adding this would reopen the exact keyword/identifier-collision class this whole session's phrase-fusion policy exists to avoid, for a single app's stylistic choice with a safe existing alternative (`*` or `×`). |
| `total`/`sum` aggregation up to the nearest `#` header | ✅ **added this iteration** | Another data point for the cross-line-access gap — see the unified writeup below, now shipped as `packages/lines/`'s `total above`/`sum above`. |

## NumPad — novel items beyond prior overlap

NumPad has the most extensive documented syntax reference of any app audited so far. Most of
it overlaps with Numi/SoulverCore (already ✅); the genuinely new items:

| Feature | Status | Notes |
|---|---|---|
| **`line 1 * 2` / `line 1 : line 4` — reference a line by number, including RANGES for aggregation** (`sum(line 1 : line 4)`) | ✅ **added this iteration** | The most sophisticated version yet of the cross-line-access gap — see item 1 below, now confirmed by FOUR independent apps (Numi's `prev`, Notes Calculator's `line<N>`, Numbr's `sum`-to-header, NumPad's `line<N>` plus RANGE syntax) and shipped as `packages/lines/`'s `sum`/`total`/`average(line X : line Y)`. |
| Percentage ratio forms: `$40 as a % of $50`, `$60 as a % on $50`, `$40 as a % off $50` | ⏸️ identified, not yet speced | These compute the percentage itself as the result (inverse direction from everything implemented this pass, which takes a percent and solves for an amount). NumPad's own docs don't fully disambiguate `as a % on`/`as a % off`'s exact semantics beyond one example each — worth a closer look before implementing, to avoid guessing at the wrong formula and shipping a silently-wrong result (this codebase's #1 stated priority per every finance/percentage parselet's own doc comments). Not attempted this pass for that reason. |
| Variables with spaces/apostrophes (`Alice's food = £30`) | ⚠️ design difference, not a gap | Same underlying issue as Numbr's space-containing variable names — see the Numi table's "Variables" row above for the full reasoning (this engine's `:name` policy exists specifically to avoid the collision class bare/space-containing identifiers reopen). Two independent apps now do this, which is worth remembering if the variable-syntax policy is ever revisited wholesale, but not a quick fix in isolation. |
| `X to Y` as **subtraction** (documented as "alternative subtraction, right-to-left") | ⚠️ semantic collision with existing `to`, not adopted | This engine (and SoulverCore, and Numi via `%` phrasing) already uses `X to Y` for **percentage change** (`800 to 1000` → 25%) and for **unit conversion** (`100cm to m`). Giving `to` a THIRD, mutually-exclusive meaning (plain subtraction) would make `5 to 3` genuinely ambiguous with the percentage-change form already shipped and tested. Confirmed as a real design divergence between apps, not something to copy. |
| Number bases (`0b101010`, `0o777`, `0xcab1`) | ✅ | Octal was the one gap here — see the Numi table above, already closed this pass. |
| Compound/derived-unit conversion (`4.6L/100km in miles / gallon`, `26.2 miles / 3 hours 30 minutes in min/km`) | ⏸️ identified, not yet speced | This engine's `Rate` primitive (`vm/Value.ts`) already handles rate ARITHMETIC (`30 fps * 3 minutes`) and simple rate construction, but converting one COMPOUND rate directly to another compound rate's units wasn't specifically checked against these exact examples. Flagged for a future closer look rather than guessed at. |

---

## Calca — full 100% parity roadmap (a different product category, chased deliberately)

Calca (`calca.io/reference`) is a different kind of product than every other app audited above —
a full symbolic-math/CAS (computer algebra system) tool, not a natural-language numeric
calculator: matrix literals/indexing/transpose (`^T`)/inverse (`^-1`)/determinant, complex numbers
(`i`, `1+2i`, `conj()`, `sqrt(-x)`), symbolic calculus (`der(f, var[, n])`,
`taylor(f, var=point, degree)`, `jacobian(f1, f2, ...)`), a general backward-solving operator
(`x => ...`), `map`/`reduce`/`sum`/`prod` over ranges (`0:3`), `let...in` local bindings, named
function parameters (`f(y=5, x=3)`), markdown-heading-scoped variable scope, mid-document locale
switching (`#@fr-FR`), and multiple statements per line via `;`. **Explicit product direction: chase
100% parity with this, not a "different category, don't bother" writeup** — including
consolidating the existing separate `Vector2`/`Vector3`/`Vector4` types into a general matrix
representation so one feature covers both use cases, and treating Calca's own syntax as a floor,
not a ceiling.

Two items are already covered, no new work needed: comparison/logical operators match the
existing Conditionals package; `variable = ?` matches the already-shipped Knowledge package's
`rawLinePatterns`-based grammar (see `SOULVERCORE_FEATURE_AUDIT.md`) — **improved this iteration**:
Calca's own `= ?` marker is a bare trailing punctuation puzzle that doesn't read as "ask a
question," so a clearer, self-documenting leading form (`search: <query>` / `ask: <query>` /
`google: <query>`) was added alongside it (not replacing it — both resolve identically), per the
explicit product direction to treat Calca's syntax as a floor, not a ceiling.

**The load-bearing insight that reorders everything below**: `der()`/`taylor()`/`jacobian()`/
`x => ...`/`map`/`reduce` all need the SAME missing primitive underneath them — a named, reusable,
callable, parameterized expression invocable multiple times with different argument values (to
numerically perturb an input for a derivative, to try successive guesses for a root-solver, to
apply a function across a range for `map`). This is *exactly* item 2 below (user-defined
functions, originally surfaced from Notes Calculator's `f(x) = 2*x + 1`) — previously one
nice-to-have feature among several, now **the foundational prerequisite for roughly half of
Calca's feature list**. Its priority moves from "large effort, no particular urgency" to "build
this first, everything else in this list depends on it."

Full symbolic differentiation/equation-solving (keeping an actual manipulable expression tree and
applying calculus/algebra rules to it) would mean a second evaluation model living alongside the
current flat-bytecode VM — a genuine, large undertaking on its own. The pragmatic path to the SAME
user-visible capability, reusing the existing numeric bytecode-VM engine rather than building a
CAS from scratch: **numerical approximation** — finite-difference derivatives
(`der(f, x) ≈ (f(x+h) - f(x-h)) / 2h`), Taylor series built from repeated numerical derivatives,
Jacobians as a matrix of numerical partial derivatives, and Newton-Raphson (or bisection)
root-finding for `x => ...`. All of these become straightforward once user-defined functions
exist, since they all reduce to "evaluate this callable expression at several different input
values and combine the results" — no symbolic manipulation required.

**This is a multi-iteration roadmap, not a single pass**:

- **Phase 1 (✅ shipped this iteration)**: user-defined, parameterized, reusable functions —
  item 2 below. Unlocks Phases 4-6 entirely; independently valuable on its own.
- **Phase 2 (queued next)**: general Matrix value type, consolidating `Vector2`/`Vector3`/
  `Vector4` into it (a vector becomes an N×1 matrix) — literals, 2D indexing, sub-matrix slicing,
  transpose, inverse, determinant, matrix arithmetic.
- **Phase 3 (queued next)**: complex numbers (`i`, arithmetic, `conj()`, negative `sqrt()`).
- **Phase 4 (depends on Phase 1)**: numerical `der()`/`taylor()`/`jacobian()`.
- **Phase 5 (depends on Phase 1)**: `x => ...` general solving via numerical root-finding.
- **Phase 6 (depends on Phase 1 for map/reduce; independent for the rest)**: `map`/`reduce`/
  `sum`/`prod` over ranges, `let...in`, named parameters, heading-scoped variable scope,
  mid-document locale switching, `;`-separated multi-statement lines.

Attempting Phases 2-6 in the same pass as Phase 1 would be reckless — each is itself a non-trivial
design (a matrix value representation touching `Value.ts`/`FormatEngine.ts`/every Vector consumer;
a new `ValueType.Complex` with its own arithmetic-opcode overloads) deserving its own dedicated
pass and verification, matching this codebase's established practice of not rushing large
architecture changes. One small, independently-tractable item worth doing whenever convenient
(no dependency on any Phase): unary `!`/NOT — the `BANG` token is already lexed and categorized
as an operator but has zero consuming parselet anywhere, confirmed dead code.

---

## Confirmed engine limitations (for future architecture planning)

### 1. ✅ SHIPPED — execution-context access for cross-line data (`prev`, `line<N>`/ranges, `sum`/`total`/`average` across lines)

**Confirmed by FOUR independent apps**, the strongest, most-repeated signal in this whole
audit: Numi's `prev` (any preceding line, implicit), Notes Calculator's `line<N>`/`l<N>` (any
line, explicit absolute reference), Numbr's `sum`/`total`-to-nearest-header, and NumPad's
`line<N>` PLUS range syntax (`sum(line 1 : line 4)`) — four different apps, four different
surface syntaxes, all needing the exact same missing primitive underneath. Shipped this
iteration as `packages/lines/` — see `ENGINE_ITERATIONS.md`'s 2026-08-01 entry for the design
that landed (a `LineExecutionContext` threaded optionally through `executeBytecode`/`CALL_PLUGIN`,
`ExpressionEngine.setDocumentModel`/`makeLineContext`, and a new package covering `prev`,
`line<N>`/`line N`, `sum`/`total`/`average(line X : line Y)`, and `total above`/`sum above`/
`average above`). `l<N>` (the bare short alias) remains deliberately deferred, per the original
v1 scope note below.

**Root cause**: `IEnginePackage.pluginFunctions` handlers — the extension point every
"read some other line's value" feature would need — have the signature
`(args: Value[]) => Value | Promise<Value>` (`vm/VMBuiltins.ts`'s `pluginFunctionRegistry`).
There is **no execution context parameter at all**: no current line number, no reference to
`DocumentModel`, nothing beyond the literal arguments the expression's own bytecode computed.
Confirmed by reading the actual registry type and every real consumer (weather, stocks,
timezone math, inflation) — none receive or need anything beyond `args`, because none of them
have ever needed to look at *another line*.

The data these features need already exists, just not exposed to this extension point:
`DocumentModel.getLineAt(position: number): LineState | undefined`
(`engine/DocumentModel.ts`) returns a `LineState` whose `.result: Value | null` field holds
exactly the cached per-line result `prev`/`line<N>`/cross-line aggregation would read.

**Concrete design sketch for a future fix** (not attempted this pass — this is genuine new VM
surface area, not a package-level addition using existing primitives):
1. Extend `EvalResult`'s pending/execution path so `executeBytecode()` (and therefore
   `CALL_PLUGIN`'s dispatch) can optionally receive a small `LineExecutionContext` — at minimum
   `{ lineIndex: number }`, ideally also a bound `getLineResult(n: number): Value | undefined`
   closure over the owning `DocumentModel`.
2. Widen `pluginFunctionRegistry`'s handler type to
   `(args: Value[], context?: LineExecutionContext) => Value | Promise<Value>` — optional, so
   every existing handler stays source-compatible.
3. `ThreeTierEvaluator`/`ExpressionEngine` would need to thread the current line's index through
   to `executeBytecode()` at each of its call sites (Tier 1 fresh-compile, Tier 2 cached-replay) —
   today neither passes any line-identifying context into the VM at all.
4. A new `packages/lines/` (or similar) package could then implement `prev` (context.lineIndex-1),
   `line<N>`/`l<N>` (a normalizer-fused token capturing N, resolved via `context.getLineResult(N)`),
   and the `sum`/`average`/`total`-until-blank-line aggregation SoulverCore's own audit already
   flagged — all three built on the SAME new primitive, not three separate ad hoc mechanisms.
5. Real design questions to resolve before implementing, not before documenting: what happens
   when line N hasn't been evaluated yet (forward reference — since `ThreeTierEvaluator`
   processes lines in ascending order per `ARCHITECTURE.md` §7, a forward `line5` reference from
   line 2 would read a stale/absent result — needs an explicit error, not a silent 0); whether
   `evaluateExpression()` (the single-expression API with no document at all) should reject these
   keywords outright rather than silently returning something meaningless.

**Effort/risk**: MEDIUM — touches the VM's execution entry points and `ThreeTierEvaluator`'s call
sites, but is additive (optional parameter, no existing behavior changes) and unlocks three
independently-motivated features at once.

### 2. ✅ SHIPPED — mechanism for user-defined, parameterized, reusable functions

This was originally just a Notes Calculator gap, but turned out to be the prerequisite primitive
for roughly half of Calca's feature list (`der`/`taylor`/`jacobian`/`x => ...`/`map`/`reduce`, all
implementable via numerical methods once callable user functions exist). Phase 1 of the Calca
roadmap, shipped this iteration: `f(x) = 2*x + 1`, then `f(5)` → `11`, composable
(`double(double(5))`), multi-parameter, works across units/constants. See
`ENGINE_ITERATIONS.md`'s 2026-08-01 "User-defined, parameterized functions ship" entry for the
full implementation writeup — the parser fast-path workaround `IDENT`'s Tier-1 dispatch required,
the name-keyed (not index-based) VM call-frame design and why it lives on the VM instance rather
than a module-level registry, and the three non-obvious hardening risks (recursion depth,
`VMCheckpointer` scroll survival, DAG parameter-shadowing) a rough sketch of this feature would
have missed.

**Root cause**: `BytecodeBuilder` compiles each line to ONE flat, single-use
`BytecodeProgram` (`opcodes: Uint8Array`, `numbers: Float64Array`, `strings: string[]`) — see
`ARCHITECTURE.md` §4. Built-in functions (`sqrt`, `pow`, ...) are fixed-arity native JS closures
in `vm/VMBuiltins.ts`, invoked via `CALL_BUILTIN` — they were never expression bytecode
themselves, just JS functions the VM calls into. Notes Calculator's `f(x) = 2*x + 1` needs the
OPPOSITE: a NAMED, REUSABLE, PARAMETERIZED chunk of *user-authored expression bytecode*,
invocable multiple times with different argument values (`f(5)`, then later `f(10)`) — a concept
this engine has no equivalent of anywhere today. Variables (`:name = value`) are the closest
existing thing, but they hold one fixed `Value`, not a parameterized computation.

**Concrete design sketch for a future fix**:
1. Parse-time detection: `IDENT LPAREN <param-list> RPAREN EQUALS` at the start of a line needs
   to be distinguished from a plain function CALL (`f(5)` with no trailing `=`) — a one-token
   lookahead past the closing `)` (peek for `EQUALS`), similar in spirit to how this codebase
   already resolves other assignment-vs-read ambiguities (see `VariableParselet.ts`), but new
   for the *bare-identifier* (non-colon-prefixed) case specifically.
2. Compile the function BODY to its own small, independent `BytecodeProgram`, with parameter
   names resolved to a NEW kind of slot — not the shared `GlobalVariableStore`, since two
   different calls (`f(5)` then `f(10)`) must not clobber each other's parameter bindings, and
   recursion/nesting (`double(double(5))`, which Notes Calculator's own docs show working) needs
   a real call-stack of parameter bindings, not a single flat map.
3. A new `CALL_USER_FUNCTION` opcode: push argument values, look up the stored `{params, program}`
   by name, push a fresh parameter-binding frame, execute the stored program against it, pop the
   frame, push the result. This is genuinely new VM machinery (a minimal call-frame mechanism),
   not an addition to any existing opcode.
4. Storage: a new per-`ExpressionEngine` registry (`Map<string, {params: string[], program:
   BytecodeProgram}>`), populated by the definition-line parselet, consulted by `CALL_USER_FUNCTION`
   and by name resolution generally (so `f(5)` doesn't accidentally throw "undefined variable"
   the way a bare unknown identifier would today).

**Effort/risk**: LARGE — this is a genuine new VM primitive (parameterized, reusable,
independently-compiled bytecode with its own call-frame), not a package built on existing
extension points the way every SoulverCore-parity package this session added was. Worth
real, dedicated design time before implementation — now underway (Calca Phase 1), given how much
downstream capability depends on it.

### 3. No mechanism for a variable assignment to reconfigure a unit's conversion ratio

**Root cause**: Numi's `ppi = 326` then `1.2em in px` example changes what `em`↔`px`
conversion MEANS for the rest of the session, based on a plain variable assignment. This
engine's entire unit system (`uom/UomConverter.ts`, backed by the `convert` npm package, plus
this session's own `EXTENDED_UNITS`/`isWorkdayUnit`-style custom-measure shims) is a **static,
module-load-time-built lookup table** — every unit's conversion ratio is fixed at build time,
looked up by name, never mutated at runtime. No existing mechanism lets ANY expression (variable
assignment or otherwise) change how a unit converts; `:name = value` variables hold plain
`Value`s, never unit-ratio overrides.

**Concrete design sketch for a future fix**: would need a new, explicitly-scoped
`dynamicUnitRatios: Map<string, number>` (or similar) living on the `ExpressionEngine` instance
(not a module-level global — see `ARCHITECTURE.md` §10's L1 cross-instance-isolation gap; a
feature that lets one document's input silently change another document's math would be a much
worse version of that same bug), a special-cased assignment form recognizing `ppi = <number>` (or
a more general `unit <name> ratio = <number>` syntax) that writes to it, and
`UomConverter.convertUnit()`/`getMeasure()` checking this per-engine override map BEFORE falling
through to the static tables — mirroring the `isWorkdayUnit()` shim pattern already established
this session, but keyed to PER-ENGINE mutable state instead of a fixed ratio.

**Effort/risk**: SMALL-MEDIUM in isolation, but low priority — `px`/`pt`/`em`/`ppi` is a narrow,
web-design-specific use case with no other requester across any of the three apps audited so
far. Worth building only if a concrete user need for CSS-unit math surfaces, not preemptively.

---

## Summary

Nine small-to-medium items were genuinely implementable with existing primitives and were
implemented this pass: octal literal input, `arcsin`/`arccos`/`arctan` aliases, `root(n, x)`,
`fact`/`factorial`, `KiB`/`MiB`/`GiB`/`TiB` binary-prefix data units, three percentage
"solve for the unknown" forms (`N% of/on/off what is X`), and `¥`/`₽`/`₩` currency symbols
(which also surfaced and fixed a real registration-drift bug in the currency package — see the
Numbr section above). All verified via the full four-command gate (`tsc --noEmit --skipLibCheck`,
full `jest --no-coverage` — 151/152 suites, 3316/3323 tests, the one failure being the
pre-existing known-flaky GC-timing benchmark — `tsup`, and the plugin's production `esbuild`).

Three items were confirmed as real engine limitations, each with a concrete root cause and a
design sketch rather than a vague "not supported." **Two have since shipped** (2026-08-01
iteration, see `ENGINE_ITERATIONS.md`): cross-line data access (`prev`, `line<N>`/ranges,
cross-line `sum`/`average`/`total` — confirmed by FOUR independent apps, the highest-leverage of
the three) as `packages/lines/`, and user-defined parameterized functions as Calca Phase 1. The
third, dynamic unit-ratio reconfiguration, remains deliberately deferred — only one app wants it,
and it's entangled with the already-tracked L1 cross-instance-isolation gap. None were forced
through with a half-measure — each genuinely needed new VM/engine surface area, which is exactly
the kind of thing worth planning deliberately rather than rushing.

A further three items were identified but deliberately left unspeced rather than guessed at:
NumPad's `as a % on`/`as a % off` ratio forms (ambiguous exact semantics from the docs alone) and
compound-rate-to-rate conversion (needs checking against this engine's existing `Rate` primitive
before claiming gap or non-gap). Two design differences were confirmed as intentional divergences,
not gaps: bare/space-containing variable names (this engine's `:name` policy is a deliberate,
tested choice — see [[solve-soulvercore-parity]]) and `to` as subtraction (would collide with
this engine's existing, shipped `to`-as-percentage-change and `to`-as-unit-conversion meanings).

**Calca** (audited separately above, a different product category — full CAS/symbolic-math, not
a natural-language calculator) is being chased to 100% parity by explicit product direction, via
a 6-phase roadmap rather than a quick feature check. Its research reordered this document's own
priorities: user-defined parameterized functions (item 2 above) turned out to be the prerequisite
primitive for roughly half of Calca's feature list, elevating it from "large effort, no particular
urgency" to Phase 1 — shipped this iteration.

**Process note, not a feature**: researching Calca's compatibility-checking needs alongside the
"make packages resilient to overlapping logic" product direction surfaced a real, live bug class
independent of any single-app research — three built-in packages (`finance`, `uom`, `variables`)
had their real `IEnginePackage` descriptor silently out of sync with a parallel hand-written
test-harness registration helper (the same class the `currency` package hit earlier this session).
Fixed structurally, not just detected: all 15 packages' duplicate registration functions were
eliminated in favor of one generic, descriptor-driven helper — see `ENGINE_ITERATIONS.md` for the
full writeup.
