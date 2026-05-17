# IMPLEMENTATION PLAN: Standardize Error Handling with SolveError/Result<T,E>

## Bug: UnifiedErrorFramework exists but is never used in hot path (B5)
## GAP: Inconsistent Error Handling Across Codebase
**File(s)**: `src/solve-js/src/errors/UnifiedErrorFramework.ts`, `src/solve-js/src/vm/VM.ts`, `src/solve-js/src/parser/Parser.ts`, `src/solve-js/src/lexer/MarkdownLexer.ts`, `src/solve-js/src/engine/ExpressionEngine.ts`

## Problem
The project has an excellent `SolveError` class, `ErrorFactory`, `Result<T,E>` type, and `ErrorRecovery` enums — but they're completely unused in the actual code. Instead:
- Parser throws generic `Error("No prefix parselet found for token: ...")`
- VM throws generic errors for stack underflow
- Some code returns `null` silently, other code throws
- No consistent pattern for error classification or recovery

## Implementation Steps

### Step 1: Create error helper module (1 hour)
- [ ] New file: `src/solve-js/src/errors/ErrorHelpers.ts`
- [ ] Helper functions:
  - `throwParsingError(token, message)` — creates SolveError with PARSING category, throws
  - `throwExecutionError(message, context)` — creates SolveError with EXECUTION category, throws
  - `throwValidationError(message, context)` — creates SolveError with VALIDATION category, throws
  - `wrapResult<T>(value: T): Result<T, SolveError>` — wraps success
  - `wrapError(error: unknown): SolveError` — normalizes unknown errors

### Step 2: Update Parser.ts (45 min)
- [ ] Import and use `throwParsingError` instead of `new Error(...)`
- [ ] Add context to all throws (token type, value, position)
- [ ] Replace `"Unexpected end of expression"` with proper SolveError
- [ ] Replace `"No prefix parselet found..."` with proper SolveError
- [ ] Replace `"Expected token type..."` with proper SolveError

### Step 3: Update VM.ts (1-2 hours)
- [ ] Add stack underflow checks before pop/peek operations
- [ ] Create dedicated error codes for VM errors
- [ ] Wrap opcode execution in try-catch with SolveError re-throw
- [ ] For corrupted bytecode (index out of bounds), return error via Result instead of crashing
- [ ] Handle `PUSH_STRING` with out-of-bounds index gracefully

### Step 4: Update ExpressionEngine.ts to use Result pattern (1-2 hours)
- [ ] `evaluateLine()` — currently catches Error and re-throws. Change to return `Result<Value, SolveError>` OR keep throwing but with typed SolveError
- [ ] `evaluateExpressionWithDiagnostic()` — same treatment
- [ ] `parseDocument()` — currently catches errors per-line. Use SolveError categories for classification
- [ ] Decide and document: which functions throw, which return Result

### Step 5: Add ErrorRecoveryManager integration (1 hour)
- [ ] Wire `ErrorRecoveryManager.execute()` into the data query pipeline
- [ ] Add retry logic for external data source failures
- [ ] Add fallback behavior for recoverable errors

### Step 6: Update remaining files (1 hour)
- [ ] `DataQueryWorker.ts` — replace `console.warn` with proper error handling
- [ ] `DataSourceStrategy.ts` — ensure all fetch errors produce typed errors
- [ ] `VariableResolver.ts` — decide behavior on source failure
- [ ] `CurrencyExchange.ts` — handle missing rates with typed errors

### Step 7: Write tests (1 hour)
- [ ] Test that parser throws SolveError with PARSING category
- [ ] Test that VM throws/correctly handles stack underflow
- [ ] Test that corrupted bytecode doesn't crash VM
- [ ] Test ErrorFactory methods produce correct error types
- [ ] Test ErrorRecoveryManager retry logic

## Acceptance Criteria
- [ ] All `new Error(...)` calls in production code are replaced with `SolveError`
- [ ] Parser errors are classified as PARSING category
- [ ] VM errors are classified as EXECUTION or VALIDATION category
- [ ] `ErrorRecoveryManager` is actually usable for data source operations
- [ ] All existing tests still pass
- [ ] New error handling tests added

## Risk Level: Medium
## Estimated Time: 8-10 hours

## Notes
- This is a foundational change. Do it before any major feature work.
- Keep backward compatibility — functions that currently throw `Error` should now throw `SolveError` (which extends Error).
- Take care not to break existing test assertions that check for generic Error messages. Adjust test message checks if needed.