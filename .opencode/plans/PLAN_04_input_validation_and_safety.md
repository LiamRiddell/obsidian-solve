# IMPLEMENTATION PLAN: Add Input Validation & Execution Safety Limits

## Bugs: No Input Sanitization (B10), No Parse Depth Limit (B11), No VM Execution Limit (B12)
**File(s)**: `src/solve-js/src/constants/Configuration.ts`, `src/solve-js/src/parser/Parser.ts`, `src/solve-js/src/vm/VM.ts`, `src/solve-js/src/engine/ExpressionEngine.ts`

## Problem
The engine has a `ValidationConfig` with `maxExpressionLength`, `maxComplexity`, and `maxNestingDepth` but NEVER checks them. The parser has no recursion limits. The VM has no instruction count limits. Malicious or malformed input can cause infinite loops or stack overflows.

## Implementation Steps

### Step 1: Wire ValidationConfig into ExpressionEngine (1 hour)
- [ ] Store `ConfigManager` or `ValidationConfig` in `ExpressionEngine`
- [ ] Add validation check at the top of `evaluateExpressionWithDiagnostic()`:
  ```typescript
  if (expression.length > this.config.validation.maxExpressionLength) {
    throw ErrorFactory.validation('EXPRESSION_TOO_LONG', 
      `Expression exceeds max length of ${this.config.validation.maxExpressionLength}`);
  }
  ```

### Step 2: Add nesting depth tracking to Parser.ts (1-2 hours)
- [ ] Add `private depth: number = 0;` to Parser class
- [ ] Increment before recursive `parseExpression()` call, decrement after
- [ ] Check against configurable max:
  ```typescript
  parseExpression(bindingPower = 0, builder?: BytecodeBuilder): void {
    this.depth++;
    if (this.depth > this.maxDepth) {
      this.depth--;
      throw throwParsingError(..., "Nesting depth exceeded");
    }
    try {
      // existing logic
    } finally {
      this.depth--;
    }
  }
  ```
- [ ] Add `maxDepth` parameter to Parser constructor (default from config)
- [ ] Update `load()` to reset depth

### Step 3: Add instruction limit to VM.ts (1-2 hours)
- [ ] Add `maxInstructions` parameter to `createVM()` (default: 10000)
- [ ] Track instruction count in `executeBytecode()`:
  ```typescript
  let instructionCount = 0;
  const maxInstr = vm.maxInstructions ?? 10000;
  while (ip < opcodes.length) {
    instructionCount++;
    if (instructionCount > maxInstr) {
      return vm.pop(); // or throw
    }
    // existing switch
  }
  ```
- [ ] VM interface needs new property: `maxInstructions: number`

### Step 4: Add stack depth limit to VM.ts (1 hour)
- [ ] Add `maxStackDepth` parameter (default: 100)
- [ ] Check on every push:
  ```typescript
  push(v: Value): void {
    if (this.stack.length >= (this.maxStackDepth ?? 100)) {
      throw new SolveError(ErrorCategory.EXECUTION, 'STACK_OVERFLOW', '...');
    }
    this.stack.push(v);
  }
  ```

### Step 5: Add expression complexity scoring (1-2 hours)
- [ ] In `ExpressionEngine.evaluateExpressionWithDiagnostic()`, after tokenization:
  - Count tokens
  - Count function calls
  - Count nesting depth (rough: count parentheses)
  - Compare against `maxComplexity`
- [ ] Formula: `complexity = tokenCount + functionCallCount * 5 + nestingDepth * 10`

### Step 6: Add configuration defaults for new limits (30 min)
- [ ] Update `Configuration.ts` defaults:
  ```typescript
  validation: {
    maxExpressionLength: 2000,      // characters
    maxComplexity: 500,              // complexity score
    maxNestingDepth: 50,             // parentheses/parser depth
  }
  ```
- [ ] Add to `EngineConfig`:
  ```typescript
  vm: {
    maxStackDepth: 200,
    maxInstructions: 50000,
  }
  ```

### Step 7: Write tests (1.5 hours)
- [ ] Test that expression exceeding max length is rejected
- [ ] Test that deeply nested expression is rejected
- [ ] Test that VM with infinite loop expression is terminated
- [ ] Test that stack overflow is prevented
- [ ] Test that high-complexity expression is rejected
- [ ] Test that reasonable expressions still pass

## Acceptance Criteria
- [ ] `maxExpressionLength` is enforced (throws error on violation)
- [ ] `maxNestingDepth` is enforced in parser
- [ ] `maxInstructions` terminates execution of runaway bytecode
- [ ] `maxStackDepth` prevents stack overflow crashes
- [ ] `maxComplexity` rejects overly complex expressions
- [ ] All existing tests still pass (reasonable defaults won't break normal use)

## Risk Level: High (safety-critical)
## Estimated Time: 10-12 hours

## Notes
- Execution limits are the #1 production safety concern
- Default limits should be generous enough for all legitimate use cases
- Consider returning a partial result (with error) rather than throwing — this enables graceful degradation in the editor plugin