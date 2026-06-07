# Inline Solve Token Index Tracking Plan (Inline Recording)

## Goal

After lexing a line, the lexer automatically records token indices for every
inline solve span (`s\`...\``). No separate string scan needed. Zero overhead
in production — the incremental cost is a single `tokenIndex++` per token.

---

## Motivation

The lexer already detects `s\`` in `tokenizeIdentifier()` and emits `INLINE_SOLVE_START`.
The closing backtick comes through as `BACKTICK_OPEN` in the main `CharClass.BACKTICK`
case. We can record token indices **inline** during tokenization — zero overhead for
lines without inline solves, negligible overhead when one is found.

Current flow (redundant):
1. `classifyFromPositions()` does `indexOf('s\`')` → `hasInlineSolve: boolean`
2. `findInlineSolves()` does a second `indexOf('s\`')` scan → `InlineSolveSpan[]` (char offsets only)

Proposed flow (single-pass):
1. `classifyFromPositions()` still does `indexOf('s\`')` for fast skip gating
2. During tokenization, when emitting `INLINE_SOLVE_START`, record `startTokenIndex`
3. When emitting the closing `BACKTICK_OPEN`, record `endTokenIndex` and emit the span
4. `hasInlineSolve` is derived from `spans.length > 0` — exact, not guessed

## Key Insight: The lexer token flow for `s\`5+5\``

```
Input:  s ` 5 + 5 `
        │ │ │ │ │ │
Tokens: └─INLINE_SOLVE_START─┘  (tokenizeIdentifier: sees 's' + backtick, emits "s`")
              └─NUMBER "5"──┘    (tokenizeNumber)
                └─PLUS "─"──┘   (tokenizeOperator)
                  └─NUMBER "5"──┘ (tokenizeNumber)
                    └─BACKTICK_OPEN┘ (CharClass.BACKTICK: emits "`")
```

`INLINE_SOLVE_START` consumes **both** `s` and the opening backtick.
The closing backtick is a separate `BACKTICK_OPEN` token. Everything in between is
normal tokenization.

## Implementation

### Phase 1: Add inline solve tracking state to the `[Symbol.iterator]()` generator

**File:** `src/solve-js/src/lexer/ExpressionLexer.ts`

Add a `tokenIndex` counter and an inline solve collector inside the generator:

```ts
*[Symbol.iterator](): Generator<Token, void, undefined> {
    const len = this.len;
    if (len === 0) return;
    
    // NEW: inline solve tracking state
    let tokenIndex = 0;
    let openSpan: { startTokenIndex: number; startColumn: number } | null = null;
    const collectedSpans: InlineSolveSpan[] = [];
    
    // ... 1-char fast path (same as before) ...
    
    // Main tokenization loop
    while (this.pos < len) {
        const token = /* ... produce token ... */;
        
        // NEW: check for inline solve boundaries
        if (token.type === 'INLINE_SOLVE_START') {
            openSpan = { startTokenIndex: tokenIndex, startColumn: token.col };
        }
        
        yield token;
        tokenIndex++;
        
        // NEW: check for closing backtick while inside an inline solve
        if (token.type === 'BACKTICK_OPEN' && openSpan) {
            collectedSpans.push({
                start: 0,  // char offset TBD — may populate later for compat
                end: 0,
                expression: '',  // reconstruct from tokens[startIdx..endIdx] later
                columnNumber: openSpan.startColumn,
                startTokenIndex: openSpan.startTokenIndex,
                endTokenIndex: tokenIndex - 1,  // index of BACKTICK_OPEN
            });
            openSpan = null;
        }
    }
    
    // Expose spans so scanDocument() can read them
    this._inlineSolveSpans = collectedSpans;
}
```

**Important**: The `yield` happens BEFORE the closing-backtick check. This means
`BACKTICK_OPEN` has already been emitted by the time we check. The `endTokenIndex`
is `tokenIndex - 1` (the token we just yielded).

### Phase 2: Expose collected spans as instance property

Add to `ExpressionLexer`:

```ts
/** Inline solve spans collected during the most recent tokenization pass. */
_inlineSolveSpans: InlineSolveSpan[] = [];
```

This is populated by `[Symbol.iterator]()` and read by `scanDocument()`.

### Phase 3: Add `startTokenIndex`/`endTokenIndex` to `InlineSolveSpan`

```ts
export interface InlineSolveSpan {
    start: number;
    end: number;
    expression: string;
    columnNumber: number;
    /** NEW: token index of INLINE_SOLVE_START in the line's token array */
    startTokenIndex?: number;
    /** NEW: token index of closing BACKTICK_OPEN in the line's token array */
    endTokenIndex?: number;
}
```

Optional fields (`?`) for backward compatibility — `findInlineSolves()` doesn't
populate them, only the inline recording path does.

### Phase 4: Update `scanDocument()` to use inline-collected spans

**File:** `src/solve-js/src/lexer/ExpressionLexer.ts`

Currently:
```ts
let inlineSolves: InlineSolveSpan[] = [];
if (classification.hasInlineSolve) {
    inlineSolves = this.findInlineSolves(lineText);
}
```

Replace with:
```ts
// Inline solves are collected inline during tokenization (by [Symbol.iterator]).
// If the line was classified as having inline solves, the spans were already
// recorded with token indices. Otherwise, fall back to findInlineSolves() for
// skipped lines (which aren't tokenized).
let inlineSolves: InlineSolveSpan[] = [];
if (classification.hasInlineSolve) {
    if (!classification.skip && tokens.length > 0) {
        // Spans were collected inline during tokenization — use those.
        // They already have startTokenIndex/endTokenIndex populated.
        // Backfill expression from tokens[startIdx..endIdx]
        inlineSolves = this._inlineSolveSpans.map(span => {
            const exprTokens = tokens.slice(span.startTokenIndex! + 1, span.endTokenIndex!);
            const expression = exprTokens.map(t => t.text).join('');
            return { ...span, expression };
        });
    } else {
        // Skipped lines weren't tokenized — fall back to string scan
        inlineSolves = this.findInlineSolves(lineText);
    }
    this._inlineSolveSpans = [];  // clear for next line
}
```

**Alternative**: Instead of reconstructing `expression` from tokens, just collect it
inline during tokenization (append each yielded token's text to a running string).
But reconstructing is cleaner — it avoids extra string allocations in the hot path.

### Phase 5: Update `LineClassificationOutput` in diagnostic types

**File:** `src/solve-js/src/types/DiagnosticPipelineResult.ts`

```ts
/** Inline solve span with token indices for diagnostic rendering. */
export interface InlineSolveSpanInfo {
    startTokenIndex: number;
    endTokenIndex: number;
    expression: string;
    columnNumber: number;
}

export interface LineClassificationOutput {
    type: "line_classification";
    classification: MarkdownLineType;
    skip: boolean;

    /** @deprecated Derived from inlineSolveSpans.length > 0. */
    hasInlineSolve: boolean;
    /** Inline solve spans with token indices (empty if none). */
    inlineSolveSpans: InlineSolveSpanInfo[];
}
```

### Phase 6: Emit `line_classification` stage in diagnostic pipeline

**File:** `src/solve-js/src/engine/ExpressionEngine.ts`

Currently `evaluateExpressionWithDiagnostic()` does NOT emit a `line_classification`
stage — it jumps from `pipeline_start` straight to `safety_length`. After the lexer
stage (where tokens are populated), add:

```ts
if (hasCollectors) {
    // Line classification: detect inline solves from token types
    const inlineSolveSpans: InlineSolveSpanInfo[] = [];

    // Scan tokens for INLINE_SOLVE_START → ... → BACKTICK_OPEN pairs
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'INLINE_SOLVE_START') {
            const startIdx = i;
            // Find closing backtick
            let endIdx = -1;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'BACKTICK_OPEN') {
                    endIdx = j;
                    break;
                }
            }
            if (endIdx > startIdx) {
                const exprTokens = tokens.slice(startIdx + 1, endIdx);
                const expression = exprTokens.map(et => et.value).join('');
                inlineSolveSpans.push({
                    startTokenIndex: startIdx,
                    endTokenIndex: endIdx,
                    expression,
                    columnNumber: t.col || 1,
                });
                i = endIdx;  // skip past this span
            }
        }
    }

    this.addDiagnosticStage(stages, 'line_classification', 'Line Classification', '📋', 'classify', 2, zeroElapsed, false, {
        type: 'line_classification',
        classification: 'expression',
        skip: false,
        hasInlineSolve: inlineSolveSpans.length > 0,
        inlineSolveSpans,
    });
}
```

**Note**: This is a simple token-type scan that only runs in diagnostic mode
(`hasCollectors` guard). In production, the guard is `false` and this entire
block is skipped — zero overhead. No string scanning needed — purely token-type based.

### Phase 7: Update PipelineTab renderer

**File:** `playground/src/components/PipelineTab.vue`

Enhance the `line_classification` renderer to show per-span detail chips:

```ts
line_classification(stage) {
    const o = stage.output as any;
    const chips: any[] = [];

    // ... existing classification type badge ...
    // ... existing skip badge ...

    // Inline solve span chips: s`expr` [2..5]
    if (o.inlineSolveSpans?.length > 0) {
        for (const span of o.inlineSolveSpans) {
            chips.push(h("span", {
                style: {
                    fontSize: "9px", padding: "1px 6px", borderRadius: "3px",
                    background: "rgba(205,132,252,0.15)", color: "#c084fc",
                    border: "1px solid rgba(205,132,252,0.3)",
                },
                title: `s\`${span.expression}\`\nTokens: [${span.startTokenIndex}..${span.endTokenIndex}]\nColumn: ${span.columnNumber}`,
            }, `s\`${span.expression}\` [${span.startTokenIndex}..${span.endTokenIndex}]`));
        }
    }

    return h("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" } }, chips);
}
```

### Phase 8: Deprecate `findInlineSolves()` as the primary path

`findInlineSolves()` remains for backward compat (skipped lines, standalone calls),
but `scanDocument()` now prefers inline-collected spans. The `hasInlineSolve`
boolean on `LineClassification` is still set by `classifyFromPositions()` for
fast skip gating, but overridden by actual span collection after tokenization.

---

---

## Summary

| Phase | File | Change |
|-------|------|--------|
| 1 | `ExpressionLexer.ts` | Add `tokenIndex` counter + inline solve collector in `[Symbol.iterator]()` |
| 2 | `ExpressionLexer.ts` | Add `_inlineSolveSpans` instance property |
| 3 | `ExpressionLexer.ts` | Add `startTokenIndex?`/`endTokenIndex?` to `InlineSolveSpan` |
| 4 | `ExpressionLexer.ts` | `scanDocument()` uses `_inlineSolveSpans` instead of `findInlineSolves()` |
| 5 | `DiagnosticPipelineResult.ts` | Add `InlineSolveSpanInfo` + `inlineSolveSpans[]` to `LineClassificationOutput` |
| 6 | `ExpressionEngine.ts` | Emit `line_classification` stage via token-type scan (only when `hasCollectors`) |
| 7 | `PipelineTab.vue` | Render per-span chips (purple) showing `s\`expr\` [start..end]` |
| 8 | — | Typecheck + review |

**Performance**:
- **Production** (`diagnosticMode = false`): The `hasCollectors` guard is `false`,
  so the `line_classification` scan never runs. The only overhead is `tokenIndex++`
  in the generator (one integer increment per token) — negligible.
- **Diagnostic mode**: A single O(n) pass over the token array to find
  `INLINE_SOLVE_START` → `BACKTICK_OPEN` pairs. Token allocation dominates.

**Correctness**: `hasInlineSolve` becomes exact — derived from `spans.length > 0`,
not from a separate `indexOf` scan that might miss edge cases. No async tracking
added — diagnostics must have zero overhead in production.
