# Unified Parsing Architecture

## Overview
This refactoring integrates line analysis directly into the core parsing engine, eliminating performance overhead caused by the previous decoupled implementation. The engine now serves as a unified, polymorphic processor capable of accepting diverse input types and returning comprehensive results with precise coordinate mapping.

## Key Changes

### 1. Unified Parsing Interface
- Created `ExpressionEngine.parseDocument()` method that accepts different input types (Markdown, raw text, code)
- Returns `ParsingResult` containing:
  - `ParsedLine[]`: Detailed information for each line including inline solves, coordinates, and results
  - `totalLines`: Total number of lines processed
  - `errors`: Collection of parsing errors

### 2. Integrated Coordinate System
- `InlineSolvePosition` now includes precise coordinate information:
  - `start`: Character position in line
  - `end`: End position in line
  - `lineNumber`: Line number (1-based)
  - `columnNumber`: Column number (1-based)
  - `result`: Evaluation result (if successful)
  - `error`: Error message (if failed)

### 3. Performance Optimizations
- Eliminated separate `LineAnalyzer` class - logic integrated into engine
- Single-pass regex for empty line detection: `/^\s*$|^\s*([#>-]|\*|\+)\s*$/`
- No string allocation via `trim()` in hot paths
- Inline solve detection happens during primary parsing pass

### 4. Architectural Improvements
- **Engine as Source of Truth**: All parsing logic centralized in `ExpressionEngine`
- **Frontend as Thin Consumer**: `MarkdownEditorViewPlugin` and `SolveHighlightProvider` now use engine's unified interface
- **Polymorphic Processing**: Single method handles different input types via `UnifiedParsingOptions`

## File Changes

### New Files
- `src/engine/types/ParsingResult.ts`: Type definitions for unified parsing results

### Modified Files
- `src/engine/engine/ExpressionEngine.ts`: Added unified parsing interface
- `src/codemirror/MarkdownEditorViewPlugin.ts`: Updated to use unified interface
- `src/codemirror/SolveHighlightProvider.ts`: Updated to use engine's lexer
- `test/engine/analysis/LineAnalyzer.spec.ts`: Updated to test unified interface

### Deleted Files
- `src/engine/analysis/LineAnalyzer.ts`: Logic integrated into engine
- `test/engine/analysis/LineAnalyzer.spec.ts`: Replaced by integrated tests

## Usage Example

```typescript
const engine = new ExpressionEngine("en");

// Parse a document with inline solves
const result = engine.parseDocument("s`1 + 2`\ns`3 + 4`", { 
  inputType: 'markdown' 
});

// Access results per line
result.lines.forEach(line => {
  if (line.hasInlineSolves) {
    line.inlineSolves.forEach(solve => {
      console.log(`Line ${solve.lineNumber}, Col ${solve.columnNumber}: ${solve.expression} = ${solve.result}`);
    });
  }
});
```

## Benefits
1. **Performance**: Single-pass parsing eliminates redundant processing
2. **Accuracy**: Precise coordinate mapping ensures correct widget positioning
3. **Maintainability**: Centralized logic reduces code duplication
4. **Extensibility**: Unified interface supports future input types
5. **Testability**: Engine logic is fully unit-testable independent of UI