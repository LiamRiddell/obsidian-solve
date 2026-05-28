# Plan 02: Lexer Consolidation — Remove MarkdownLexer

## Status: DONE ✅

## Problem
The old `MarkdownLexer.ts` (moo/regex-based, ~180 lines) is still in the codebase but only used by
`MarkdownElements.spec.ts`. The new `ExpressionLexer.ts` (V8-optimized, char-by-char) already handles
both markdown line classification (`classifyLine()`) and expression tokenization (`tokenizeAll()`).

The `Lexer.ts` wrapper already delegates to `ExpressionLexer` for both purposes.

## Changes Made

1. **Rewrote `MarkdownElements.spec.ts`**: All 18 tests now use `Lexer`/`ExpressionLexer` instead of `MarkdownLexer`.
   - Tests for markdown markers (headings, lists, blockquotes, code fences, math blocks) now use `classifyLine()`
   - Tests for expression tokenization (numbers, operators, inline solves) now use `reset()` + iteration
   - HighlightProvider tests unchanged (already use `ExpressionEngine`)

2. **Deleted `MarkdownLexer.ts`**: Removed old moo-based lexer completely.

3. **Removed `moo` dependency**: `moo` was only used by `MarkdownLexer.ts`. Removed from `package.json`.

## Benefits
- Eliminates ~180 lines of duplicate/moot code
- Removes 1 npm dependency (moo)
- Single lexer engine for all tokenization
- Simplifies the mental model: one lexer, two modes (classify + tokenize)
