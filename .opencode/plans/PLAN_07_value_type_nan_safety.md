# IMPLEMENTATION PLAN: Fix Duplicate-Extends Violation in Value Type

## Bug: Method on Value class hides inherited method functionality
**File**: `src/solve-js/src/vm/Value.ts`

## Problem
The `Value` class defines a method named `toNumber()` but there's also a property named `value` of type `number | bigint | string | boolean | number[]`. The method shares the same name as the concept it accesses, which is fine, but the `toNumber()` implementation has a subtle bug — it returns `parseFloat(this.value as string)` for `String` type values, which will return `NaN` for non-numeric strings. This propagates silently through calculations.

## Implementation Steps

### Step 1: Add NaN guard to string conversion (30 min)
- [ ] Modify `toNumber()` in `Value.ts`:
  ```typescript
  toNumber(): number {
    if (typeof this.value === 'number') return this.value;
    if (typeof this.value === 'bigint') return Number(this.value);
    const parsed = parseFloat(this.value as string);
    if (isNaN(parsed)) {
      console.warn(`[solve-js] Attempted toNumber() on non-numeric string: "${this.value}"`);
      return 0; // Fallback to 0 for non-numeric strings
    }
    return parsed;
  }
  ```

### Step 2: Add `isNaN()` check method (30 min)
- [ ] Add helper method to Value:
  ```typescript
  isNaN(): boolean {
    if (this.type === ValueType.String) {
      return isNaN(parseFloat(this.value as string));
    }
    return false;
  }
  ```

### Step 3: Update VM binary operations for NaN safety (1 hour)
- [ ] In `binaryOp()` function in `VM.ts`, add NaN check:
  ```typescript
  function binaryOp(l, r, op, bigOp) {
    // ... existing type checks ...
    const lNum = l.toNumber();
    const rNum = r.toNumber();
    if (isNaN(lNum) || isNaN(rNum)) {
      return numberValue(0); // or throw, depending on error strategy
    }
    return numberValue(op(lNum, rNum));
  }
  ```

### Step 4: Write tests (30 min)
- [ ] Test: `numberValue("hello").toNumber()` returns 0 (not NaN)
- [ ] Test: Arithmetic with non-numeric string doesn't propagate NaN
- [ ] Test: Valid numeric strings still parse correctly

## Acceptance Criteria
- [ ] `toNumber()` never returns NaN — always has a safe fallback
- [ ] Arithmetic operations don't silently propagate NaN values
- [ ] Existing numeric behavior is preserved
- [ ] All existing tests pass

## Risk Level: Low
## Estimated Time: 2-3 hours

## Notes
- This is a defensive change — "hello" + 1 currently produces NaN, which then propagates silently
- Consider making this throw instead of returning 0, depending on error strategy decisions in PLAN_03