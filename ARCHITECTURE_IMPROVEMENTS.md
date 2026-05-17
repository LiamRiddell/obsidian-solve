# Architecture Improvements for solve-js Engine

This document outlines identified issues and improvement suggestions for the solve-js engine and Obsidian plugin. This will be reviewed separately at the end of refactoring.

## 1. Code Quality & Style

### 1.1 Junior Developer Patterns
- **Excessive Use of `any` Type**: Multiple files use `any` type which reduces type safety
  - `src/solve-js/src/engine/engine/ExpressionEngine.ts:230` - `containerEl: any`
  - `src/solve-js/src/workers/DataQueryWorker.ts:104` - `context: any`
  - `src/solve-js/src/workers/DataQueryWorker.ts:179` - `context: any`
  
- **Inconsistent Error Handling**: Some areas use try-catch while others don't
  - VM operations should have consistent error handling
  - Provider registration should validate inputs

- **Magic Numbers**: Hardcoded values scattered throughout
  - `src/solve-js/src/providers/providers/datetime/parselets/NowParselet.ts` - Date offsets
  - `src/solve-js/src/providers/providers/dice/parselets/DiceRollParselet.ts` - Dice configurations

### 1.2 Code Organization
- **Mixed Responsibilities**: Some files handle multiple concerns
  - `src/solve-js/src/engine/engine/ExpressionEngine.ts` - Parsing, execution, caching, dependency tracking
  - `src/solve-js/src/workers/DataQueryWorker.ts` - Data fetching, currency conversion, error handling

## 2. Performance & Efficiency

### 2.1 Caching Strategy
- **Multiple Cache Layers**: LineCache, MemoCache, LFUCache - potential redundancy
- **Cache Invalidation**: No clear strategy for cache invalidation when variables change
- **Memory Usage**: Large documents could lead to memory issues with current caching

### 2.2 Parsing Performance
- **Repeated Tokenization**: Lexer might re-tokenize same expressions multiple times
- **Dependency Graph Complexity**: DAG calculations could be optimized for large documents
- **Bytecode Generation**: Could be pre-compiled for common expressions

### 2.3 Worker Implementation
- **Current State**: Workers are tightly coupled to specific data sources (currency, data query)
- **Improvement**: Generic worker interface with pluggable implementations
- **Status**: ✅ Partially addressed with new worker interface

## 3. Architecture & Design

### 3.1 Tight Coupling
- **Engine-Provider Coupling**: ExpressionEngine directly imports specific providers
  ```typescript
  // Current (in ExpressionEngine constructor):
  registerArithmeticParselets(this.registry);
  registerPercentageParselets(this.registry);
  // ... etc
  ```
  **Improvement**: Use dependency injection or plugin registration pattern

- **Global State**: Shared registries (ParseletRegistry, OpRegistry) create global state
  **Improvement**: Consider instance-based registries with isolation

### 3.2 Extensibility
- **Provider Registration**: Currently hardcoded in engine constructor
- **Plugin System**: Existing SolveAPI allows registration but engine doesn't use it
- **Improvement**: Make engine initialization accept provider list or use discovery pattern

### 3.3 Error Handling
- **Inconsistent Error Types**: Mix of Error objects, strings, and custom error classes
- **No Error Recovery**: Some parsing errors halt entire document processing
- **Improvement**: Graceful degradation with partial results

## 4. Testing & Quality Assurance

### 4.1 Test Coverage
- **Unit Tests**: Good coverage for core components
- **Integration Tests**: Limited coverage for provider interactions
- **Performance Tests**: No benchmark tests for parsing/execution speed
- **Improvement**: Add performance regression tests

### 4.2 Mocking Strategy
- **Current**: Manual mocking in test files
- **Improvement**: Standardized mocking infrastructure for workers, external APIs

## 5. Documentation & Maintainability

### 5.1 Code Documentation
- **Missing JSDoc**: Many public APIs lack documentation
- **Complex Algorithms**: Dependency graph, bytecode execution lack explanation
- **Improvement**: Add comprehensive JSDoc comments

### 5.2 Type Safety
- **Loose Types**: Some interfaces could be more specific
- **Improvement**: Use branded types for domain concepts (e.g., `CurrencyCode`, `VariableName`)

## 6. Specific File-Level Issues

### 6.1 `src/solve-js/src/engine/engine/ExpressionEngine.ts`
- **Line 392**: Large method `parseDocument` could be broken down
- **Line 150+**: Complex dependency tracking logic
- **Improvement**: Extract methods for better readability

### 6.2 `src/solve-js/src/workers/DataQueryWorker.ts`
- **Line 94**: Currency-specific logic in generic worker
- **Line 145**: API endpoint hardcoded
- **Improvement**: Make data sources configurable/pluggable

### 6.3 `src/solve-js/src/providers/providers/uom/UnitOfMeasurement.ts`
- **Complex conversion logic**: Multiple unit systems
- **Improvement**: Extract conversion strategies

## 7. Security Considerations

### 7.1 Input Validation
- **Expression Parsing**: No validation of expression length/complexity
- **Worker Messages**: No validation of message payloads
- **Improvement**: Add input sanitization and validation

### 7.2 Data Sources
- **Currency API**: Hardcoded Frankfurter API endpoint
- **Improvement**: Make endpoints configurable, add fallback sources

## 8. Recommended Refactoring Order

1. **Immediate** (High Impact):
   - Add type safety (remove `any` types)
   - Standardize error handling
   - Add input validation

2. **Short-term** (Medium Impact):
   - Refactor ExpressionEngine for better separation of concerns
   - Improve caching strategy
   - Add performance tests

3. **Long-term** (Architecture):
   - Implement plugin system for providers
   - Add configuration management
   - Consider micro-architecture for large documents

## 9. Success Metrics

- **Performance**: 20% improvement in parsing speed for large documents
- **Type Safety**: Zero `any` types in production code
- **Test Coverage**: 80%+ coverage for core components
- **Documentation**: All public APIs documented with JSDoc

---

**Note**: This document should be reviewed after refactoring is complete to assess progress on these improvements.
