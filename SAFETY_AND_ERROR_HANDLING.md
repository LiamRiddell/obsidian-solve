# SAFETY AND ERROR HANDLING — solve-js

> How errors flow through the system and how the engine protects itself from bad input.

---

## 1. Safety Limits (MUST be enforced)

These values are defined in `Configuration.ts` and **must be checked before any heavy work begins**. Currently defined but NOT enforced — this is a P0 gap.

| Limit | Default | Where checked |
|-------|---------|---------------|
| `maxExpressionLength` | 2000 chars | Before lexing |
| `maxComplexity` | 500 (tokens + fns×5 + parens×10) | Before parsing |
| `maxNestingDepth` | 50 levels | During parsing |
| `maxInstructions` | 50,000 per expression | VM execution loop |
| `maxStackDepth` | 200 frames | VM stack pushes |
| `maxDocumentLines` | 10,000 | Before document parse |
| `parseTimeoutMs` | 5,000ms | Parser timeout |
| `executionTimeoutMs` | 10,000ms | VM timeout |

---

## 2. The `SolveError` Class

All runtime errors in the hot path must be `SolveError` instances. Never `throw new Error()`.

```typescript
import { SolveError, ErrorFactory, ErrorCategory, ErrorSeverity, ErrorRecovery } from '@solve-js/errors';

// Use the factory — don't construct SolveError directly
throw ErrorFactory.parsing('INVALID_TOKEN', `Unexpected token: ${token}`, { token });
throw ErrorFactory.validation('EXPR_TOO_LONG', `Expression exceeds ${limit} chars`, { length });
throw ErrorFactory.execution('DIV_BY_ZERO', 'Division by zero');
throw ErrorFactory.execution('STACK_UNDERFLOW', 'VM stack underflow');
```

### Error categories

| Category | Meaning | Default Recovery |
|----------|---------|-----------------|
| `PARSING` | Can't parse the expression | `SKIP` — skip line, continue document |
| `EXECUTION` | Runtime error during evaluation | `DEGRADED` — report error, continue |
| `VALIDATION` | Input exceeds safety limits | `NONE` — reject before processing |
| `EXTERNAL` | Data source / worker failure | `RETRY` — with exponential backoff |
| `INTERNAL` | Engine invariant violation | `NONE` — crash loudly |
| `CONFIG` | Bad configuration value | `NONE` — reject at startup |

### Error factory shortcuts

```typescript
ErrorFactory.parsing(code, message, context?)
ErrorFactory.validation(code, message, context?)
ErrorFactory.execution(code, message, context?)
ErrorFactory.external(code, message, context?)
ErrorFactory.internal(code, message, context?)
ErrorFactory.config(code, message, context?)
```

---

## 3. Result Type for Non-Throwable Contexts

When a function should return failure instead of throwing:

```typescript
import { Result } from '@solve-js/errors';

type ParseResult = Result<Value, SolveError>;

function safeParse(expr: string): ParseResult {
  try {
    return { ok: true, value: engine.evaluateLine(1, expr) };
  } catch (e) {
    return { ok: false, error: e instanceof SolveError ? e : ErrorFactory.internal('UNKNOWN', String(e)) };
  }
}
```

---

## 4. NaN Safety

`Value.toNumber()` **must never return NaN**. The current implementation returns `0` for non-numeric strings:

```typescript
toNumber(): number {
  if (typeof this.value === 'number') return this.value;
  if (typeof this.value === 'bigint') return Number(this.value);
  const result = parseFloat(this.value as string);
  return isNaN(result) ? 0 : result; // Safety guard
}
```

All arithmetic operations must guard against NaN inputs:

```typescript
binaryOp(l, r, op) {
  const ln = l.toNumber();
  const rn = r.toNumber();
  // NaN was already converted to 0 by toNumber(), but double-check for clarity
  return numberValue(op(ln, rn));
}
```

---

## 5. Input Validation Pipeline

```
Expression string
    │
    ▼
[1] Length check        → reject if > maxExpressionLength
    │
    ▼
[2] Complexity scoring  → reject if > maxComplexity
    │
    ▼
[3] Lexing              → token stream
    │
    ▼
[4] Nesting depth check → reject if > maxNestingDepth
    │
    ▼
[5] Parsing             → AST / bytecode
    │
    ▼
[6] VM execution        → capped at maxInstructions / maxStackDepth
    │
    ▼
[7] Result              → Value or SolveError
```

Steps 1-4 happen BEFORE any heavy allocation. Step 6 has hard limits inside the VM loop.

---

## 6. DependencyGraph Safety

The `DependencyGraph` must handle edge cases without infinite loops:

- **Circular dependencies**: Instruction limit in VM prevents infinite evaluation, but DAG should detect and report cycles
- **Re-registration**: Calling `registerLine()` twice for same line must clean up old references before adding new ones
- **Removal**: `removeLine()` must clean both the line's reads AND remove the line from other variables' consumer sets

---

## 7. Worker Failure Handling

```typescript
// DataQueryService must:
// 1. Retry with exponential backoff (maxRetries from WorkerConfig)
// 2. Fall back to main thread on persistent worker failure
// 3. Propagate the error to the UI — never silently return null
// 4. Log worker health checks
```

---

## 8. VM Resilience Rules

The VM **must never crash**, even on malformed bytecode:

- `pop()` on empty stack → return `numberValue(0)`, not throw
- Out-of-bounds opcode index → HALT with error, not crash
- Unknown opcode → HALT with `ErrorFactory.execution('UNKNOWN_OPCODE', ...)`
- Instruction counter exceeds `maxInstructions` → throw `ErrorFactory.validation(...)`
- Stack depth exceeds `maxStackDepth` → throw `ErrorFactory.validation(...)`