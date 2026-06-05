# PageManager — Technical Transfer Document

> **Audience:** Maintainers and collaborators who need to understand, modify, or debug the memory eviction subsystem.
> **Scope:** Deep-dive into `PageManager.ts` — design, algorithms, invariants, and integration points.
> **Date:** June 2026

---

## 1. What Problem Does PageManager Solve?

Solve evaluates mathematical expressions on every keystroke. In a 10,000-line document, caching bytecode and results for every line would consume hundreds of megabytes of memory. The naive approach — cache everything forever — is neither necessary nor practical.

The **PageManager** bounds memory usage to O(viewport-adjacent pages) while preserving the performance benefits of caching for lines the user is actually looking at or likely to scroll to. It does this by dividing the document into fixed-size pages, assigning each a "temperature" based on distance from the viewport, and evicting data from distant pages.

**Key insight:** The user only needs cached bytecode/results for ~12 pages around the viewport (6 in each direction). Everything else can be evicted and re-compiled on demand. The cost of re-compiling a cold line on scroll-back is ~1-2ms (Tier 1), which is below human perception thresholds.

---

## 2. Core Concepts

### 2.1 Page Model

The document is carved into **128-line pages** (0-indexed). This granularity was chosen empirically:

| Lines/Page | Too Small | Too Large |
|-----------|-----------|-----------|
| 32 | Excessive LRU churn; every scroll frame crosses many page boundaries | — |
| 128 | — | — |
| 512 | — | Coarse grained; a single page spans multiple screenfuls; wastes memory keeping distant lines hot |

A typical editor viewport shows 30-50 lines, so 128 lines ≈ 2-4 screenfuls per page. The viewport almost always spans 1-2 pages.

**Page numbering:**
```
Line 1     → Page 0  (= Math.floor((1-1) / 128))
Line 128   → Page 0
Line 129   → Page 1  (= Math.floor((129-1) / 128))
Line 10000 → Page 78
```

### 2.2 Temperature Tiers

Each page belongs to exactly one tier, determined by its distance from the viewport:

```
Distance from viewport    Tier         Policy
─────────────────────────────────────────────────
0-3 pages                Hot          Keep bytecode + results (never evict)
4-6 pages                Warm         Keep bytecode, evict results
7+ pages                 Cold         Evict bytecode + results, mark dirty
```

The radii are additive from the **viewport span** (start page → end page), not just the viewport start:

```
Viewport: lines 200-400 → pages 1-3

Hot range:  pages max(0, 1-3) to min(lastPage, 3+3) = pages 0-6
Warm range: pages max(0, 1-6) to min(lastPage, 3+6) = pages 0-9

Hot pages:  0, 1, 2, 3, 4, 5, 6
Warm pages: 0-9 (hot pages 0-6 subtracted → warm = 7, 8, 9)
Cold pages: 10+ and any pages before 0 (none in this case)
```

### 2.3 Variable Definition Pinning

Variable definition lines (e.g., `:tax = 10%`) are **never evicted**. Their bytecode forms the backbone of the dependency graph — if you evict `:tax = 10%`, you break every line that reads `tax`. This is enforced by the `isVariableDef` guard in both `evictPageResults` and `evictPageBytecode`:

```typescript
if (!state || state.isVariableDef) continue;  // skip variable defs
```

---

## 3. The Three Eviction Methods

### 3.1 `maintainAfterEval(viewport, doc)` — The Main Entry Point

Called after every `evaluate()` or `setViewport()`. This is the heart of the PageManager. It does four things in order:

**Step 1: Capture scroll direction** (before updating `lastViewportStart`)

```typescript
this.savedDirection = this.detectDirection(viewport);
this.lastViewportStart = viewport.startLine;
```

The direction is saved for later use by `getPreloadTargets`. It's captured before updating `lastViewportStart` because `detectDirection` compares new viewport against the old one.

**Step 2: Compute tier boundaries**

```typescript
const viewportStartPage = PageManager.pageForLine(viewport.startLine);
const viewportEndPage = PageManager.pageForLine(viewport.endLine);

const hotStart = Math.max(0, viewportStartPage - HOT_PAGE_RADIUS);   // -3
const hotEnd = Math.min(lastPage, viewportEndPage + HOT_PAGE_RADIUS); // +3
const warmStart = Math.max(0, viewportStartPage - WARM_PAGE_RADIUS);  // -6
const warmEnd = Math.min(lastPage, viewportEndPage + WARM_PAGE_RADIUS);// +6
```

**Step 3: Touch hot pages (LRU)**

```typescript
for (let p = hotStart; p <= hotEnd; p++) {
    this.touchPage(p);  // records access with monotonic sequence number
}
```

**Step 4: Evict warm and cold pages**

- Warm-but-not-hot: evict results only (keep bytecode for Tier 2)
- Cold buffer: evict bytecode + results (only the "newly cold" pages just outside warm range)

The cold eviction uses a **buffer zone** (3 pages wide) to avoid O(total pages) iteration:

```typescript
// Left side: pages just before warm range, going back COLD_EVICT_BUFFER pages
const coldLeftEnd = warmStart - 1;
const coldLeftStart = Math.max(0, coldLeftEnd - COLD_EVICT_BUFFER + 1);

// Right side: pages just after warm range, going forward COLD_EVICT_BUFFER pages
const coldRightStart = warmEnd + 1;
const coldRightEnd = Math.min(lastPage, coldRightStart + COLD_EVICT_BUFFER - 1);
```

This is a critical optimization. Without the buffer, `maintainAfterEval` would iterate all cold pages on every scroll frame — O(total pages) instead of O(hot + warm + buffer). Pages beyond the buffer were already evicted on prior scrolls and don't need re-eviction (the inner `evictPageBytecode` checks `bytecodes.length > 0` and short-circuits).

### 3.2 `evictPageResults(pageNum, doc, docLineCount)` — Warm Eviction

For each line in the page that is **not** a variable definition:
- Sets `state.results = []` (evicts display values)
- Preserves `state.bytecodes` (so Tier 2 execution works on scroll-back)

**Why evict results but keep bytecode?** The user has scrolled past these lines but might scroll back. Bytecode is compact (~20-50 bytes per expression) and expensive to regenerate (requires lex→parse→compile). Results are a single `Value` object and trivial to recompute from bytecode (~0.1ms via Tier 2).

### 3.3 `evictPageBytecode(pageNum, doc, docLineCount)` — Cold Eviction

For each line in the page that is **not** a variable definition and has data to evict:
- Sets `state.bytecodes = []` (evicts compiled bytecode)
- Sets `state.results = []` (evicts display values)
- Sets `state.dirty = true` (marks for Tier 1 re-evaluation on scroll-back)

The `dirty = true` flag is essential: when the user scrolls back to this line, the ThreeTierEvaluator sees `dirty && visible` and routes it to Tier 1 (full pipeline), recompiling the expression from scratch.

---

## 4. Scroll Direction Detection

### 4.1 `detectDirection(newViewport)` — Comparison Logic

```typescript
detectDirection(newViewport: { startLine: number }): "down" | "up" | null {
    if (this.lastViewportStart === null) return null;   // first call
    if (newViewport.startLine > this.lastViewportStart) return "down";
    if (newViewport.startLine < this.lastViewportStart) return "up";
    return null;  // no movement
}
```

**Key invariant:** `lastViewportStart` is always the viewport position from the **previous** `maintainAfterEval` call. This is why direction must be captured **before** updating `lastViewportStart`.

**Why only `startLine`?** The viewport end moves proportionally with start (viewport size is roughly constant at ~30-50 lines). Using startLine is sufficient for direction detection and avoids false positives from viewport size changes.

### 4.2 Direction Lifecycle

```
First call:               direction = null  (no history)
Scroll down:              direction = "down"
Scroll down further:      direction = "down"  (consistent)
Stop scrolling:           direction = null  (startLine unchanged)
Scroll up:                direction = "up"
```

`getPreloadTargets` uses the saved direction (not a fresh detection) because by the time it's called, `maintainAfterEval` has already updated `lastViewportStart`.

---

## 5. Preloading Strategy

### 5.1 `getPreloadTargets(viewport, doc)` — What Gets Preloaded

Returns expressions that should be sent to the background compilation worker so bytecode is cache-hot before the user scrolls to those lines.

**Selection criteria (all must be true):**
1. Line is in a preload page (2 pages ahead of scroll direction, beyond the hot radius)
2. Line is dirty (no valid cached bytecode)
3. Line is non-empty (has evaluable content)
4. Line doesn't already have bytecode (unless it's a variable def — variable defs always have bytecode since they're pinned)

**Filter expressed in code:**
```typescript
if (!state.dirty) continue;                                    // already clean
if (state.bytecodes.length > 0 && !state.isVariableDef) continue; // has bytecode
if (state.isEmpty) continue;                                    // empty/markdown
```

### 5.2 Expression Extraction (Three-Tier)

The preloader needs to extract evaluable expressions from lines. This is the same three-tier pattern used elsewhere in the codebase:

**Tier A: Pre-extracted expressions** (from prior evaluation)
```typescript
if (state.expressions.length > 0) {
    for (const expression of state.expressions) {
        items.push({ lineId: state.lineId, expression, textHash: state.textHash });
    }
}
```

**Tier B: Lexer-based inline solve extraction** (not yet evaluated)
```typescript
const inlineSpans = sharedLexer.findInlineSolves(state.text);
if (inlineSpans.length > 0) {
    for (const span of inlineSpans) {
        items.push({ lineId: state.lineId, expression: span.expression, textHash: state.textHash });
    }
}
```

**Tier C: Full-line expression fallback**
```typescript
const expression = state.text.trim();
if (expression) {
    items.push({ lineId: state.lineId, expression, textHash: state.textHash });
}
```

This three-tier extraction is critical for inline solve support. Without it, a line like `I think s`2+2` is correct` would send the full prose `I think s`2+2` is correct` to the compilation worker, which would fail to parse it. With the lexer path, only `2+2` is extracted and compiled.

### 5.3 Preload Page Calculation

**Scrolling down:**
```
preload pages = [viewportEndPage + HOT_PAGE_RADIUS + 1, ..., + PRELOAD_PAGE_COUNT]
```
Example: viewport ends at page 5 → preload pages 9, 10 (5 + 3 + 1 = 9, then +1 for second page)

**Scrolling up:**
```
preload pages = [viewportStartPage - HOT_PAGE_RADIUS - 1, ..., - PRELOAD_PAGE_COUNT]
```
Example: viewport starts at page 10 → preload pages 6, 5 (10 - 3 - 1 = 6, then -1 for second page)

### 5.4 Thread Safety

The preloader includes `textHash` with every item. When the compilation worker returns results, `CompilationWorkerManager.storeResults` validates:

```typescript
if (!doc.isBytecodeValid(lineId, textHash)) {
    return;  // line was edited between dispatch and response → discard
}
```

This prevents stale bytecode from overwriting freshly-typed expressions.

---

## 6. LRU Tracking (Access Sequence)

The PageManager maintains a `Map<number, number>` mapping page numbers to access sequence numbers, backed by a monotonically increasing counter:

```typescript
private pageAccess: Map<number, number> = new Map();
private accessSeq = 0;

private touchPage(pageNum: number): void {
    this.pageAccess.set(pageNum, ++this.accessSeq);
}
```

**Current state:** The LRU map is updated (hot pages are "touched") but the eviction logic currently uses distance-from-viewport (geometric) rather than access-recency (temporal). The `pageAccess` map and `accessSeq` are infrastructure for a future enhancement where eviction could consider both distance AND recency — for example, a page that was recently hot but is now geometrically cold might be kept warmer than a page that hasn't been accessed in many scroll frames.

---

## 7. Integration with ThreeTierEvaluator

### 7.1 Lifecycle

```
ThreeTierEvaluator constructor:
    this.pageManager = new PageManager();

ThreeTierEvaluator.evaluate(viewport):
    // ... evaluate lines ...
    this.pageManager.maintainAfterEval(this.viewport, this.doc);

ThreeTierEvaluator.setViewport(viewport):
    // ... evaluate newly visible lines ...
    this.pageManager.maintainAfterEval(this.viewport, this.doc);

ThreeTierEvaluator.dispatchBackgroundCompiles():
    const targets = this.pageManager.getPreloadTargets(this.viewport, this.doc);
    if (targets.length > 0) {
        this.compilationWorker.compileBatch(targets);
    }
```

### 7.2 Evaluation Order Matters

The PageManager's eviction runs **after** evaluation, not before. This means:
- The current viewport's pages are always hot during evaluation
- Eviction only affects lines that were NOT in the current viewport
- A line that is both dirty and visible always gets Tier 1 evaluation before any eviction decision is made about it

### 7.3 setViewport vs evaluate

Both `evaluate()` and `setViewport()` call `maintainAfterEval`. The difference is:
- `evaluate()`: processes ALL lines from 1 to viewport end (heavy)
- `setViewport()`: processes only newly visible lines after restoring from a checkpoint (light)

The PageManager doesn't distinguish between these — it always uses the geometric distance from the current viewport. This is correct because memory pressure depends on what the user can see, not how the evaluator reached that state.

---

## 8. Clear and Reset

```typescript
clear(): void {
    this.pageAccess.clear();
    this.accessSeq = 0;
    this.lastViewportStart = null;
    this.savedDirection = null;
}
```

Called when the document is switched or the plugin is disabled. Resets all internal state to initial conditions. After `clear()`, the PageManager behaves as if it was just constructed — `detectDirection` returns `null`, `getPreloadTargets` returns `[]`.

---

## 9. Edge Cases and Invariants

### 9.1 Document Smaller Than One Page

When `docLineCount < PAGE_SIZE`, all lines are in page 0. The hot range is `[0, 0]`, warm range is `[0, 0]`, and no pages exist to evict. `maintainAfterEval` is effectively a no-op for hot pages (just updates LRU) and has nothing to evict. All lines stay hot forever.

### 9.2 Viewport Beyond Document End

`pageForLine` uses integer division: `Math.floor((lineNumber - 1) / PAGE_SIZE)`. A viewport at line 10000 in a 100-line document maps to page 78, but the `Math.min(lastPage, ...)` clamps in `pageRange` ensure we only process pages that actually contain lines.

### 9.3 Zero-Line Document

`setDocument("")` produces `[""]` (one empty line). Page 0 exists with one line. All operations handle this gracefully — the empty line is skipped by all eviction loops because `state.isEmpty` is true or `state.bytecodes.length === 0`.

### 9.4 Rapid Scrolling

During rapid scrolling (e.g., holding Page Down), `maintainAfterEval` is called on every animation frame (~16ms). The cold eviction buffer ensures that only a constant number of pages are iterated per frame, regardless of how far the user has scrolled. Far-away pages were already evicted on prior frames and are skipped.

### 9.5 Variable Defs in Cold Pages

Variable definition bytecode is never evicted, even in cold pages. This is enforced by the `state.isVariableDef` guard in both eviction methods. The rationale: variable definitions form the backbone of the dependency graph. Evicting `:tax = 10%` would break every line that reads `tax`, requiring a full DAG rebuild and re-evaluation of all dependent lines.

**Implication:** In a document with many variable definitions, memory usage may exceed the O(viewport-adjacent) bound. This is accepted as a correctness requirement — correctness over memory in this case.

---

## 10. Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| `pageForLine` | O(1) | Single integer division |
| `pageRange` | O(1) | Two arithmetic operations + clamp |
| `maintainAfterEval` | O(hot + warm + buffer pages) ≈ O(1) | Constant ~18 pages regardless of document size |
| `evictPageResults` | O(PAGE_SIZE) = O(128) per page | Iterates all lines in page |
| `evictPageBytecode` | O(PAGE_SIZE) = O(128) per page | Iterates all lines in page |
| `getPreloadTargets` | O(PRELOAD_PAGE_COUNT × PAGE_SIZE) = O(256) | 2 pages × 128 lines; also calls `findInlineSolves` per line |
| `detectDirection` | O(1) | Single integer comparison |
| `clear` | O(1) | Map clear + 3 assignments |

**Total per-frame cost:** O(hot + warm + buffer + preload) ≈ O(18 + 2) pages = O(20 × 128) ≈ O(2560) line iterations. At ~100ns per iteration (simple field checks), this is approximately 0.25ms per frame — well within the 16ms frame budget.

---

## 11. Test Coverage

The existing test suite at `src/solve-js/__tests__/integration/PageManager.spec.ts` covers:

| Category | Tests | Description |
|----------|-------|-------------|
| Static Utilities | 7 | `pageForLine` for various line numbers, `pageRange` with clamping |
| Direction Detection | 4 | First call, down, up, no movement |
| Hot Pages | 2 | Bytecode + results retained at viewport page and ±3 pages |
| Warm Pages | 2 | Bytecode retained, results evicted at ±4-6 pages; variable defs pinned |
| Cold Pages | 3 | Bytecode + results evicted, dirty marked; re-evaluation on scroll-back; variable defs pinned |
| Preload Targets | 6 | No direction, no movement, down, clean pages, cold eviction follow-up, empty line exclusion, up |
| clear() | 1 | Reset restores initial state |
| Evaluator Integration | 4 | evaluate triggers eviction, evaluateAll triggers eviction, getPageManager accessor, variable def survival |
| Preload Integration | 3 | setViewport triggers eviction, fresh PageManager works, maintainAfterEval called by both paths |
| Edge Cases | 6 | Small doc, single line, zero line, viewport beyond end, rapid calls, preload excludes lines with bytecode |

**Total: ~30 tests** covering all major paths.

---

## 12. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **128 lines per page** | Balances granularity (not too coarse for a 30-line viewport) with overhead (not too fine to cause excessive boundary crossing) |
| **Hot radius = 3 pages** | 3 pages × 128 lines = 384 lines of buffer above and below viewport. This is ~10 screenfuls — generous enough that normal scrolling stays within hot pages |
| **Warm radius = 6 pages** | 6 pages × 128 lines = 768 lines. Users rarely scroll 768 lines away and back without editing anything. The bytecode is worth keeping this long |
| **Cold buffer = 3 pages** | Matches the hot radius. Pages just outside warm range are "newly cold" — they were warm on the previous scroll. Evict them once, then skip on subsequent frames |
| **Preload 2 pages ahead** | 2 pages × 128 lines = 256 lines. This is enough to keep the compilation worker busy without wasting CPU on lines the user may never scroll to |
| **Preload offset = HOT_PAGE_RADIUS + 1** | Preload pages that are outside the hot radius (they need compilation) but not too far (user might change direction) |
| **Variable defs never evicted** | Correctness requirement. Evicting a variable definition breaks the DAG for all dependent lines |
| **Direction saved, not re-detected** | `maintainAfterEval` updates `lastViewportStart` before `getPreloadTargets` is called. Direction must be captured before this update |

---

## 13. Future Enhancements

1. **LRU-weighted eviction:** Currently, eviction is purely geometric (distance from viewport). The `pageAccess` map and `accessSeq` infrastructure is in place for a future enhancement that considers access recency. A page that was recently in-viewport but is now geometrically cold could be kept warm if the user is oscillating (scrolling back and forth).

2. **Adaptive page size:** The 128-line page size is static. For very large documents (>100K lines), a larger page size could reduce overhead. For very small documents, a smaller page size would be harmless but unnecessary (everything is hot anyway).

3. **Partial page eviction:** Currently, eviction is all-or-nothing within a page. A more granular approach could evict individual lines based on their access recency, keeping frequently-referenced lines even in cold pages.

4. **Preload priority queue:** Currently, preload targets are a flat list. A priority queue could prioritize lines that are variable definitions (more important for DAG) or lines that are closer to the viewport (more likely to be scrolled to).
