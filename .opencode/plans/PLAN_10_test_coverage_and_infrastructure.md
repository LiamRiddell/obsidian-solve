# IMPLEMENTATION PLAN: Add Missing Test Coverage & Fix Test Infrastructure

## GAP 4.1 - 4.4: Test Coverage Gaps & Infrastructure Issues

## Problem
1. No integration tests for full parseDocument() pipeline with all providers
2. No tests for modulo by zero, division by zero, stack underflow
3. No tests for circular variable dependencies
4. No tests for worker pipeline
5. Duplicated helpers across 30+ test files
6. Fragile async timing (`setTimeout`) in tests

## Implementation Steps

### Step 1: Create shared test utilities (2 hours)
- [ ] New file: `src/solve-js/__tests__/testUtils.ts`
- [ ] Common helpers:
  ```typescript
  export function createEngine(locale = 'en', diagnostic = false): ExpressionEngine {
    return new ExpressionEngine(locale, diagnostic);
  }
  
  export function evalExpr(engine: ExpressionEngine, expr: string, lineNum = 1): Value {
    return engine.evaluateLine(lineNum, expr);
  }
  
  export function evalDoc(engine: ExpressionEngine, doc: string): ParsingResult {
    return engine.parseDocument(doc, { inputType: 'markdown' });
  }
  
  export function tokenize(input: string): Token[] {
    const lexer = new Lexer();
    lexer.reset(input);
    return Array.from(lexer).filter(t => t.type !== 'WS' && t.type !== 'NEWLINE');
  }
  ```
- [ ] Remove duplicate helpers from individual test files
- [ ] Update all test files to use shared utilities

### Step 2: Add integration tests for full pipeline (2 hours)
- [ ] New file: `src/solve-js/__tests__/engine/integration.spec.ts`
- [ ] Test cases:
  - `parseDocument()` with all providers registered
  - Multi-line document with variables across lines
  - Mixed content (markdown + expressions + inline solves)
  - Error propagation across lines
  - DAG invalidation triggering re-evaluation

### Step 3: Add edge case tests (2 hours)
- [ ] New file: `src/solve-js/__tests__/engine/edgeCases.spec.ts`
- [ ] Test cases:
  - Division by zero → should return Infinity or handle gracefully
  - Modulo by zero → should handle gracefully
  - Empty expression → `""` or `"   "`
  - Expression with only whitespace
  - Extremely large numbers (beyond JS safe integer)
  - Stack underflow (force with corrupted bytecode)
  - Circular variable dependencies (`:x = :x + 1`) — MUST NOT infinite loop
  - NaN propagation through operations
  - Empty document
  - Single character expressions
  - Expressions with only comments

### Step 4: Add worker pipeline tests (2 hours)
- [ ] New file: `src/solve-js/__tests__/workers/dataQueryWorker.spec.ts`
- [ ] Mock Worker environment
- [ ] Test: DataQueryWorker processes fetch requests
- [ ] Test: DataQueryWorker handles registration
- [ ] Test: Error handling in worker
- [ ] Test: DataQueryService with real (non-worker) mode
- [ ] Test: Currency fetch and caching pipeline

### Step 5: Fix async test patterns (1 hour)
- [ ] Replace all `setTimeout` waits in tests with proper polling/async patterns
- [ ] Example — in CurrencyExchange.spec.ts and UomParselets.spec.ts:
  ```typescript
  // Before:
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // After:
  await waitForCondition(() => currencyExchangeService.hasRates(), 1000);
  ```
- [ ] Add `waitForCondition` helper to `testUtils.ts`

### Step 6: Add negative/failure tests (1.5 hours)
- [ ] Parser error doesn't crash document processing
- [ ] Invalid expression returns error in parseDocument results
- [ ] Worker timeout handling
- [ ] Data source unreachable handling
- [ ] Unknown variable returns 0 (documented behavior)
- [ ] Type mismatch (e.g., string - number) handled gracefully

### Step 7: Run full test suite and verify (1 hour)
- [ ] All existing + new tests pass
- [ ] No test flakiness (run `npm test` 5 times to check)
- [ ] Test coverage report generated

## Acceptance Criteria
- [ ] Shared test utilities replace all duplicated helpers
- [ ] Integration test covers full parseDocument pipeline
- [ ] Edge case tests cover division by zero, modulo by zero, circular dependencies
- [ ] Worker pipeline tests exist
- [ ] Async tests don't use fragile `setTimeout` patterns
- [ ] Full test suite passes reliably
- [ ] Test coverage reported (aim for >85% on core modules)

## Risk Level: Low
## Estimated Time: 10-12 hours

## Notes
- Run tests with `--verbose` flag to see individual test timing
- Consider adding `jest.retryTimes(2)` temporarily to catch flaky tests
- The integration test file should test the exact same scenarios as the LongDocumentRobustness test but at the `parseDocument()` level with all providers