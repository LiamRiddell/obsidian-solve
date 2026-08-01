# CODING STANDARDS — solve-js

> Rules that govern how code looks, feels, and behaves in this project.
> Violating these is a blocker on any PR.

---

## 1. The Cardinal Rule: No `any`

**Every `any` in production code is a bug.** If TypeScript can't infer the type, make it explicit. If you genuinely don't know the type, you haven't understood the problem yet.

| Instead of | Write |
|-----------|-------|
| `tokens: any[]` | `tokens: Token[]` |
| `program: any` | `program: BytecodeProgram` |
| `(error: unknown)` with no type guard | `normalizeUnknownError(error)` (see AGENT.md) or an `instanceof EngineError` narrow |
| `containerEl: any` leaking into core engine | Inject via typed interface |

**Current debt**: 0 `any` instances remain in solve-js production code. Zero is the target — any new `any` is a regression.

---

## 2. Error Handling

**Full reference: [`AGENT.md`](./AGENT.md#error-handling)** — canonical, kept in sync
with the actual `packages/core/src/errors/` implementation (this section used to drift
from it — e.g. referencing a `SolveError` type and a per-category recovery-strategy
dispatch that were never real — don't reintroduce that; if this section and AGENT.md
ever disagree, AGENT.md wins and this section is wrong). Summary:

### 2.1 Never `throw new Error(...)`
Use the typed error factory — `EngineError`, imported from
`@solve-js/errors/UnifiedErrorFramework`:

```typescript
// ❌ Wrong
throw new Error('Invalid expression');

// ✅ Correct
throw ErrorFactory.parsing('INVALID_EXPRESSION', 'Expression contains invalid characters', { expression });
throw ErrorFactory.validation('EXPRESSION_TOO_LONG', 'Expression exceeds max length', { length: expr.length });
throw ErrorFactory.execution('STACK_UNDERFLOW', 'VM stack underflow on pop()', { ip });
```

### 2.2 Error categories

`ErrorFactory` has six methods — `.parsing()` / `.validation()` / `.execution()` /
`.external()` (all default `recoverable: true`) and `.internal()` / `.config()` (default
`recoverable: false`). The dividing line is **user error vs. engine-internal invariant
violation** — NOT "does evaluation continue" (per-line/per-batch containment means it
always does, for any category). `recoverable` only gates message framing and telemetry.
See AGENT.md for the full per-category breakdown and worked examples.

### 2.3 Result type for fallible returns

```typescript
import { Result, ok, err } from '@solve-js/errors';

function riskyOperation(): Result<number, EngineError> {
  if (somethingWrong) {
    return err(ErrorFactory.execution('SOME_CODE', 'message'));
  }
  return ok(42);
}
```

### 2.4 The two rules that matter most
- **Never let one line/item's failure abort a whole batch or loop.** Any loop over
  multiple document lines or items must contain each iteration's failure (try/catch, or
  check `.type === 'error'` on an `EvalResult`) and continue — never let it propagate
  and take out every other, unrelated item. Two real fatal bugs of exactly this shape
  were found and fixed in 2026-08; see AGENT.md.
- **Never flatten a caught `EngineError` down to its `.message` and reconstruct a
  generic wrapper.** Re-throw the original (or build a new `EngineError` copying its
  other fields if you need to add context — `EngineError.context` is `readonly`). A
  caught error's specific `code` and `expected`/`found`/`suggestion` detail are more
  useful than any generic replacement.

---

## 3. Naming Conventions

### 3.1 Types
- **Interfaces**: `IPascalCase` — `IExpressionEngine`, `IVariableSource`
- **Type aliases**: `PascalCase` — `ParsingResult`, `BytecodeProgram`
- **Enums**: `PascalCase` — `ValueType`, `ErrorCategory`, `OpCode`
- **Branded types**: suffixed with a descriptive name — `CurrencyCode`, `VariableName`, `ExpressionHash`

### 3.2 Functions
- **Pure functions**: `camelCase` — `toNumber()`, `createEngine()`
- **Factory functions**: `createX()` or `xValue()` — `numberValue()`, `createCurrencyCode()`
- **Predicates**: `isX()` or `hasX()` — `isNumber()`, `isNaN()`, `isRecoverable()`

### 3.3 Variables
- **Local**: `camelCase` — `lexer`, `bytecode`, `result`
- **Constants**: `UPPER_SNAKE_CASE` — `MAX_INSTRUCTIONS`, `DEFAULT_CACHE_SIZE`
- **Module-level singletons**: `sharedX` prefix — `sharedOpRegistry`, `sharedLexer`
- **Never use single-letter names** except in tight loops (`i`, `j`)

### 3.4 Files
- **One primary export per file** — file name matches primary export name
- **Test files**: mirror source structure under `__tests__/`
- **Index files**: only at module boundaries — `src/engine/index.ts`, `src/cache/index.ts`

---

## 4. Module Boundaries

| Module | Responsibility | Must NOT do |
|--------|---------------|-------------|
| `lexer/` | Tokenisation only | No parsing, no execution |
| `parser/` | AST/bytecode construction | No evaluation, no I/O |
| `vm/` | Bytecode execution | No file/network access |
| `engine/` | Orchestration (lex→parse→compile→exec) | No direct DOM access |
| `cache/` | Storage and retrieval | No business logic |
| `providers/` | Domain-specific parselets | No VM manipulation |
| `diagnostics/` | Event collection | No effect on execution |
| `workers/` | Thread/process management | No parsing logic |

**Cross-module coupling rules:**
- `vm/` may import from `parser/` (bytecode types) but NOT from `lexer/`
- `engine/` may import from everything under `src/`
- `providers/` may import from `parser/` (register parselets) but NOT from `engine/`
- `cache/` is dependency-free (no imports from other modules)

---

## 5. Code Structure

### 5.1 Class size
- **Hard limit**: 300 lines per class (TSDoc header excluded)
- **Soft limit**: 200 lines — if you exceed this, extract a helper
- `ExpressionEngine.ts` is the primary offender. Refactor aggressively.

### 5.2 Function size
- **Hard limit**: 50 lines (TSDoc header excluded)
- **Soft limit**: 30 lines
- Extract predicates, helpers, and named sub-expressions

### 5.3 Nesting depth
- **Hard limit**: 3 levels
- Extract early returns and guard clauses

### 5.4 Comments & TSDoc

#### The Mandate
**Every exported symbol MUST have a TSDoc comment.** No exceptions. This includes `export class`, `export interface`, `export type`, `export function`, `export const`, and `export enum` at any scope — top-level or re-exported.

#### Why
TSDoc enables IDE hover tooltips, API reference generation, and contributor onboarding. Undocumented exports create friction for every new contributor and every code review. The cost of not documenting is paid by everyone who reads the code.

#### Template by Symbol Type

**Classes:**
```typescript
/**
 * Brief one-liner describing what this class does in the pipeline.
 *
 * Multi-paragraph description of behavior, lifecycle, and invariants.
 *
 * @example
 * ```typescript
 * const instance = new MyClass(config);
 * instance.doSomething();
 * ```
 */
export class MyClass {
```

**Interfaces:**
```typescript
/**
 * Describes the shape of a FooBar used throughout the engine.
 *
 * Implemented by providers that need to hook into the resolution pipeline.
 */
export interface IFooBar {
```

**Type aliases:**
```typescript
/**
 * Discriminated union of all possible evaluation outcomes.
 *
 * Use `unwrapEvalResult()` to extract the Value from either branch.
 */
export type EvalResult = SyncResult | PendingResult;
```

**Functions:**
```typescript
/**
 * Converts a raw numeric value into a typed Value with the given unit string.
 *
 * @param n - The numeric magnitude to wrap.
 * @param unit - The unit identifier (e.g., `"GBP"`, `"km"`, `"°C"`).
 * @returns A new Value with `type === ValueType.UOM` and the unit attached.
 * @throws {SolveError} If the unit string is empty or malformed.
 */
export function uomValue(n: number, unit: string): Value {
```

**Enums:**
```typescript
/**
 * Categories for typed error handling throughout the engine.
 *
 * Purely descriptive (what kind of failure this is) — see AGENT.md's
 * "Error handling" section for what each category actually means and how
 * it's used; it does NOT map to a distinct recovery strategy (per-line
 * containment means evaluation of the rest of the document continues
 * regardless of category).
 */
export enum ErrorCategory {
	/** Lexer/parser failure. */
	PARSING = 'PARSING',
	/** VM runtime failure. */
	EXECUTION = 'EXECUTION',
}
```

**Constants:**
```typescript
/**
 * Maximum number of VM instructions before forced termination.
 *
 * Safety limit to prevent infinite loops in user expressions.
 * Tuned to 50,000 — enough for ~500 lines of complex math.
 */
export const MAX_INSTRUCTIONS = 50_000;
```

#### Required Tags

| Tag | Required for | When |
|-----|-------------|------|
| `@param` | Functions, methods | Every parameter that isn't self-documenting by name |
| `@returns` | Functions, methods | Every non-void return |
| `@throws` | Functions, methods | Any function that can throw (use `{SolveError}` with category) |
| `@example` | Classes, interfaces | Complex usage patterns or non-obvious APIs |
| `@see` | Any | Cross-references to related symbols |
| `@deprecated` | Any | Symbols marked for removal with migration path |

#### What NOT to document
- **Private fields/methods** — use inline `//` comments for internal implementation notes
- **Redundant repetition** — don't restate the type signature; explain the *contract*
- **Obvious names** — `numToHex(n: number): string` doesn't need "Converts a number"; explain *how* it converts (IEEE 754? BigInt?)

#### Enforcement
- **Code review**: No exported symbol merges without TSDoc
- **Linting**: ESLint `jsdoc/require-jsdoc` rule (when enabled) catches missing docs
  - If you add the rule, add it to `.eslintrc` and fix all violations in the same PR

---

## 6. Performance Anti-Patterns

These are banned unless explicitly justified in a comment with benchmark data:

| Anti-pattern | Why it's banned | Acceptable alternative |
|-------------|----------------|----------------------|
| `new Uint8Array(...)` in hot loops | GC pressure, O(n) copy | Reuse via `buildInto()` or pool |
| `new Error(...)` in VM | Allocation in hot path | Pre-allocated error instances |
| `findInlineSolvesInLine()` twice on same line | Double regex work | Pass parsed result from caller |
| Creating new Lexer per expression | Regex recompilation | `lexer.reset()` reuse |
| `Array.push()` in tight loops with known size | Dynamic resize cost | Pre-allocate arrays |
| `setTimeout` for async waiting | Non-deterministic timing | `waitForCondition()` polling |

---

## 7. Testing Rules

1. Every new feature gets a test in `__tests__/`
2. Every bug fix gets a regression test named `Issue{NNN}_...`
3. Tests are deterministic — no `Date.now()`, no `Math.random()` without seeding
4. Use `expectApproximately()` for floating-point comparisons
5. Use `waitForCondition()` instead of `setTimeout` for async assertions
6. Test file names match the module under test: `VM.spec.ts` for `VM.ts`
7. Benchmarks live in `__tests__/benchmarks/` and are also Jest specs

---

## 8. TypeScript Strictness

- `strict: true` in tsconfig — no exceptions
- `noUncheckedIndexedAccess: true` — array/object access is always suspect
- `exactOptionalPropertyTypes: true` — undefined means undefined
- All `enum` usage must be `const enum` where possible
- Branded types for domain identifiers (line numbers, variable names, currency codes)