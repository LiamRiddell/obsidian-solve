# TESTING GUIDELINES — solve-js

> How to write, structure, and run tests in this project.

---

## 1. Test Structure

```
src/solve-js/
├── __tests__/
│   ├── engine/              # ExpressionEngine, VM, parser
│   │   ├── engine/          # Engine-level integration tests
│   │   ├── vm/              # VM unit tests (Value, Stack, ScopeManager)
│   │   ├── parser/          # Parser and BytecodeBuilder tests
│   │   └── api/             # SolveAPI tests
│   ├── bugs/                # Regression tests for specific issues
│   │   └── Issue{NNN}_*.spec.ts
│   ├── providers/           # One test file per provider
│   │   ├── arithmetic/
│   │   ├── percentage/
│   │   ├── datetime/
│   │   ├── uom/
│   │   ├── vector/
│   │   ├── biginteger/
│   │   ├── function/
│   │   ├── dice/
│   │   └── variables/
│   ├── benchmarks/          # Performance benchmarks (also Jest specs)
│   ├── codemirror/          # Frontend integration tests
│   └── __mocks__/           # Jest mock modules
├── tools/
│   └── testUtils.ts         # Shared helper functions
```

---

## 2. Shared Test Utilities

All test files import from `tools/testUtils.ts` — NOT from each other.

| Helper | Purpose |
|--------|---------|
| `createEngine(locale?, diagnostic?)` | Fresh engine instance per test |
| `evalExpr(engine, expr, lineNum?)` | Evaluate single expression → Value |
| `evalDoc(engine, doc)` | Evaluate full markdown document → ParsingResult |
| `tokenize(input)` | Tokenise string → filtered Token[] |
| `expectApproximately(actual, expected, epsilon?)` | Float comparison |
| `waitForCondition(condition, timeoutMs?, intervalMs?)` | Async polling |
| `generateDoc(lineCount)` | Generate N-line variable chain doc |
| `generateInlineDoc(solveCount)` | Generate inline-solve markdown |
| `benchmarkFn(fn, iterations?, warmup?)` | Timing harness for benchmarks |
| `expectNumberValue(value, expected, epsilon?)` | Typed number assertion |

---

## 3. Async Patterns

### 3.1 Use `waitForCondition()`, not `setTimeout()`

```typescript
// ❌ Wrong — fragile, non-deterministic
await new Promise(r => setTimeout(r, 100));

// ✅ Correct — deterministic, timeout-safe
await waitForCondition(
  () => engine.getVariable(':result').toNumber() === 42,
  1000,   // timeout
  10      // poll interval
);
```

### 3.2 All async operations must have timeouts
No test should hang forever. `waitForCondition` defaults to 1000ms timeout.

---

## 4. Test Naming Convention

```
// Describe what behaviour is being tested
describe('VM binary operations', () => {
  it('adds two numbers correctly', () => { ... });
  it('handles division by zero gracefully', () => { ... });
});

// Bug regression tests
describe('Issue78_inlineCommitVariable', () => {
  it('commits inline variable assignments', () => { ... });
});
```

---

## 5. What to Test

### 5.1 Unit tests (per-module)
- Public API contracts
- Edge cases (empty input, extreme values, NaN)
- Error paths (invalid input produces correct SolveError)

### 5.2 Integration tests (engine-level)
- Full `parseDocument()` pipeline with realistic markdown
- Variable dependencies across multiple lines
- Cache invalidation on variable change
- Error recovery doesn't poison subsequent evaluations

### 5.3 Regression tests (bugs)
- One test per GitHub issue, named `Issue{NNN}_shortDescription`
- Tests the exact condition that triggered the bug
- Must fail if the bug is re-introduced

### 5.4 Benchmarks
- Live in `__tests__/benchmarks/`
- Run with `npm run test:ci`
- Track regression thresholds in `benchmarks/core/thresholds.ts`

---

## 6. What NOT to Test

- Don't test the lexer/parser/micro units if the full pipeline test already covers it (unless proving a regression in a specific component)
- Don't test third-party libraries (moo, jest, esbuild)
- Don't test TypeScript types — that's what `npm run typecheck` is for

---

## 7. Running Tests

```bash
# All tests with coverage
npm test

# CI mode — no coverage, fails on threshold breach
npm run test:ci

# Engine-specific tests
npm run test:engine

# Watch mode for development
npm run test:watch

# Verbose output for debugging
npm run test:debug
```

---

## 8. Coverage Targets

| Module | Target | Current |
|--------|--------|---------|
| VM (core) | 95% | — |
| Parser | 90% | — |
| Lexer | 85% | — |
| Engine | 85% | — |
| Providers (all) | 80% | — |
| Cache layer | 90% | — |
| Error framework | 90% | — |

Coverage is a guide, not a gate. A test that proves a regression is worth more than coverage percentage.