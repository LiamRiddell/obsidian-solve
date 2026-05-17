# IMPLEMENTATION PLAN: Fix DependencyGraph — Re-registration & Cleanup (B1)

## Bug: DAG Does Not Handle Re-registration Properly; removeLine Has Subtle Issues
**File**: `src/solve-js/src/vm/DependencyGraph.ts`

## Problem (Two Issues)

### Issue A: `registerLine` doesn't clean up old consumer references on re-registration
When `parseDocument()` is called multiple times on the same document (or after edits), `registerLine()` is called for each line. If a line's `reads` array changes (e.g., different expression on same line number), old consumer references are never removed.

Example:
1. `registerLine(10, ["a"], [])` → consumers["a"] = {10}
2. User edits line 10: `registerLine(10, ["b"], [])` → consumers["b"] = {10}
3. `consumers["a"]` still has {10} — **stale reference**

This means `getAffectedLines("a")` incorrectly returns line 10 even though it no longer reads variable "a".

### Issue B: `removeLine` iterates all consumers (O(n) in variable count)
Current implementation loops through every key in the `consumers` Map to delete one line number. For a document with many unique variables, this is inefficient.

## Implementation Steps

### Step 1: Add tracking of what each line reads (30 min)
- [ ] Add a new Map: `private lineReads: Map<number, Set<string>> = new Map();`
- [ ] This tracks which variables each line is currently a consumer of
- [ ] On re-registration, use this to clean up old references

### Step 2: Update `registerLine()` to handle re-registration (1 hour)
- [ ] Before adding new consumer references, check if this line was previously registered
- [ ] If so, remove the line from consumers of variables it previously read
- [ ] Update `lineReads` to track the new set of read variables

```typescript
registerLine(lineNumber: number, reads: string[], writes: string[]): void {
    // Clean up old consumer references if re-registering
    const oldReads = this.lineReads.get(lineNumber);
    if (oldReads) {
        for (const oldRead of oldReads) {
            const consumers = this.consumers.get(oldRead);
            if (consumers) consumers.delete(lineNumber);
        }
    }
    
    // Track new reads
    this.lineReads.set(lineNumber, new Set(reads));
    
    // Existing logic... (unchanged)
    for (const dep of reads) {
        if (!this.consumers.has(dep)) this.consumers.set(dep, new Set());
        this.consumers.get(dep)!.add(lineNumber);
    }
    // ... rest unchanged
}
```

### Step 3: Update `removeLine()` to be more targeted (30 min)
- [ ] Use `lineReads` to only iterate the specific consumer sets that need updating
- [ ] Also clean up `lineReads` entry

```typescript
removeLine(lineNumber: number): void {
    // Remove from consumers of variables this line read
    const reads = this.lineReads.get(lineNumber);
    if (reads) {
        for (const readVar of reads) {
            const consumers = this.consumers.get(readVar);
            if (consumers) consumers.delete(lineNumber);
        }
        this.lineReads.delete(lineNumber);
    }
    
    // Handle writes — remove from consumers of written variables
    // (this handles the case where this line's write was preventing
    //  it from appearing in a variable's consumers — after removal,
    //  we don't need to re-add it, just clean up)
    
    this.dependencies.delete(lineNumber);
    this.writes.delete(lineNumber);
    this.dataSourceDependencies.delete(lineNumber);
    
    // Clean up data source consumers
    for (const [, consumers] of this.dataSourceConsumers) {
        consumers.delete(lineNumber);
    }
}
```

### Step 4: Update `clear()` (15 min)
- [ ] Add `this.lineReads.clear()` to the `clear()` method

### Step 5: Write unit tests (1 hour)
- [ ] Test re-registration with different reads: verify old consumer reference removed
- [ ] Test re-registration with same reads: verify consumers correct
- [ ] Test removeLine: verify all references cleaned
- [ ] Test getAffectedLines after re-registration (the core bug scenario)
- [ ] Test that the existing tests still pass

### Step 6: Integration test (30 min)
- [ ] Create test: parse a document, change variable name in one line, re-parse, verify only correct lines are marked affected

## Acceptance Criteria
- [ ] Re-registering a line with different `reads` properly cleans up old consumer references
- [ ] `getAffectedLines()` returns correct results after re-registration
- [ ] `removeLine()` properly cleans up all references
- [ ] All existing tests still pass
- [ ] New unit tests cover the reg. scenario

## Risk Level: Medium (niche but causes silent data errors)
## Estimated Time: 3-4 hours

## Notes
- This fix is important for the editor integration — when a user edits one line, the DAG needs to correctly track which other lines are affected.
- The `lineReads` approach is simple and O(k) where k is the number of variables a line reads (typically very small), instead of O(n) where n is total number of variables.