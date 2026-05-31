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
| `(error: unknown)` with no type guard | Use the `SolveError` type guard or narrow first |
| `containerEl: any` leaking into core engine | Inject via typed interface |

**Current debt**: 0 `any` instances remain in solve-js production code. Zero is the target — any new `any` is a regression.

---

## 2. Error Handling

### 2.1 Never `throw new Error(...)` in the hot path
Use the typed error factory:

```typescript
// ❌ Wrong
throw new Error('Invalid expression');

// ✅ Correct
throw ErrorFactory.parsing('INVALID_EXPRESSION', 'Expression contains invalid characters', { expression });
throw ErrorFactory.validation('INVALID_LENGTH', 'Expression exceeds max length', { length: expr.length });
throw ErrorFactory.execution('STACK_UNDERFLOW', 'VM stack underflow on pop()', { ip });
```

### 2.2 Error categories and when to use them

| Category | When | Recovery |
|----------|------|----------|
| `PARSING` | Lexer/parser failures | `SKIP` — skip the line, continue |
| `EXECUTION` | VM runtime errors | `DEGRADED` — return error result, keep engine alive |
| `VALIDATION` | Input exceeds limits | `NONE` — reject before processing |
| `EXTERNAL` | Worker/data-source failures | `RETRY` — with backoff |
| `INTERNAL` | Engine bugs, invariant violations | `NONE` — crash loudly |
| `CONFIG` | Bad configuration | `NONE` — reject at startup |

### 2.3 Result type for fallible returns

```typescript
import { Result } from '@solve-js/errors';

function riskyOperation(): Result<number, SolveError> {
  if (somethingWrong) {
    return { ok: false, error: ErrorFactory.execution('...', '...') };
  }
  return { ok: true, value: 42 };
}
```

### 2.4 Propagation
- **Parser errors**: throw `SolveError` with category `PARSING`
- **VM errors**: throw `SolveError` with category `EXECUTION`
- **Validation errors**: throw before entering the pipeline
- **Never swallow errors silently** — the `catch { durMs = 0; }` pattern in UoM conversion (VM.ts:153-159) is a bug, not a pattern to follow

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
- **Hard limit**: 300 lines per class
- **Soft limit**: 200 lines — if you exceed this, extract a helper
- `ExpressionEngine.ts` is the primary offender. Refactor aggressively.

### 5.2 Function size
- **Hard limit**: 50 lines
- **Soft limit**: 30 lines
- Extract predicates, helpers, and named sub-expressions

### 5.3 Nesting depth
- **Hard limit**: 3 levels
- Extract early returns and guard clauses

### 5.4 Comments
- **No redundant comments** — don't describe what the code does, describe *why*
- **Every exported symbol gets JSDoc** with `@param`, `@returns`, `@throws` as applicable
  - Classes: describe purpose and key behaviors
  - Interfaces/types: describe what they represent and how they're used
  - Functions: describe parameters, return value, and any thrown errors
  - Enums: describe each member's meaning
- **Every module gets a header** describing its purpose in the pipeline

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