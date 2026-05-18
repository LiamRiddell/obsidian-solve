# CONTRIBUTING — solve-js

> How to contribute to this project. Read `PROJECT_ETHOS.md` first.

---

## 1. Development Workflow

### 1.1 Branch Naming

```
feat/<short-description>       — New feature
fix/<short-description>        — Bug fix
perf/<short-description>       — Performance improvement
refactor/<short-description>   — Code restructuring (no behaviour change)
chore/<short-description>      — Tooling, config, cleanup
docs/<short-description>       — Documentation changes
plan/<phase-N>                 — Phase implementation (per MASTER_PLAN.md)
```

Examples:
- `feat/expression-compilation-cache`
- `fix/dependencygraph-removeline`
- `perf/typedarray-pooling`
- `plan/phase-1-safety-limits`

### 1.2 Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

Types:
- `fix` — bug fix
- `feat` — new feature
- `perf` — performance improvement
- `refactor` — code change without behaviour change
- `chore` — maintenance
- `docs` — documentation
- `test` — test changes
- `build` — build system changes
- `ci` — CI configuration

Examples:
```
fix(vm): add instruction limit enforcement to execution loop
perf(engine): cache typed arrays on BytecodeProgram
refactor(parser): extract expression parsing into standalone method
```

### 1.3 Phase-Based Commits

For multi-phase work, each phase is a separate commit:
```
fix: safety limits, error handling, DAG re-registration
perf: cache typed arrays, reuse VM, cache toNumber
refactor: consolidate cache systems (3 → 2)
```

Never mix phases in a single commit.

---

## 2. Code Review Checklist

Before merging, verify:

- [ ] **Tests pass** — `npm run test:ci` with zero failures
- [ ] **No new `any` types** — run `npm run typecheck`, zero new `any` in diff
- [ ] **No `throw new Error()` in hot path** — use `ErrorFactory` instead
- [ ] **Benchmarks haven't regressed** — compare before/after numbers
- [ ] **Backwards compatible** — no API signature changes without deprecation period
- [ ] **JSDoc on new exports** — every public symbol documented
- [ ] **Correct error categories** — VALIDATION for input limits, EXECUTION for runtime, PARSING for parse failures
- [ ] **Safety limits enforced** — expression length, nesting depth, instruction count, stack depth
- [ ] **No silent failures** — all errors are either thrown as `SolveError` or returned as `Result<T, E>`

---

## 3. How to Add a New Provider

1. Create a directory under `src/solve-js/src/providers/<name>/`
2. Implement parselets (prefix and/or infix) extending `PrefixParselet` / `InfixParselet`
3. Register opcodes in `OpCode.ts` (or request a range if > 1 opcode needed)
4. Export from the provider module's `index.ts`
5. Register in `ExpressionEngine.ts` constructor or via `registerPlugin()`
6. Add tests in `__tests__/providers/<name>/`
7. Run `npm run test:ci` to verify

---

## 4. How to Add a Test

```typescript
import { createEngine, evalExpr, expectApproximately } from '@solve-js/test-utils';
import { SolveError, ErrorFactory } from '@solve-js/errors';

describe('MyFeature', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('does the expected thing', () => {
    const result = evalExpr(engine, '1 + 2');
    expectApproximately(result.toNumber(), 3);
  });

  it('throws correct error for bad input', () => {
    expect(() => evalExpr(engine, 'invalid!'))
      .toThrow(SolveError);
  });
});
```

---

## 5. How to Add a Benchmark

Benchmarks live in `src/solve-js/__tests__/benchmarks/` and are standard Jest test files.

```typescript
import { benchmarkFn, createEngine } from '@solve-js/test-utils';

describe('MyBenchmark', () => {
  it('should evaluate simple expressions quickly', () => {
    const engine = createEngine();
    const result = benchmarkFn(() => {
      engine.evaluateLine(1, '1 + 2');
    }, 10000, 100);

    // Performance assertion
    expect(result.meanMs).toBeLessThan(0.01);
  });
});
```

---

## 6. Environment Setup

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests without coverage (CI mode)
npm run test:ci

# Type check only
npm run typecheck

# Lint
npm run lint

# Production build
npm run build

# Dev server / watch
npm run dev
```

---

## 7. Pull Request Process

1. Branch from `main` (or from the relevant phase branch)
2. Keep PRs small — one concern per PR
3. Include tests for new behaviour
4. Include benchmarks for performance changes
5. Update this doc if you add a new workflow pattern
6. Get at least one review before merge

---

## 8. Communication

- **Bug reports**: Open a GitHub issue with a failing test reproduction
- **Feature requests**: Open an issue with use case and expected behaviour
- **Questions**: Open a Discussion — the project is documented-first

---

*Contributing means agreeing to the ethos in `PROJECT_ETHOS.md`.*