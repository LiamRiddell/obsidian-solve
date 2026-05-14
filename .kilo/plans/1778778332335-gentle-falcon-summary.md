# Summary of Changes

## Architecture Refactoring: Proxy/Dispatcher Pattern

### 1. DataQueryWorker (Background Thread)
- **Removed**: `QueryClient` and `QueryObserver` instances
- **Simplified**: Single `executeFetch()` method for pure fetch execution
- **Result**: Minimal memory footprint, reduced complexity

### 2. DataQueryService (Main Thread - Virtual Query Client)
- **Added**: TanStack Query `QueryClient` instance
- **Implemented**: Worker bridge with promise-based message passing
- **Added**: Event system (`onCacheUpdate`, `onError`) for reactivity
- **Result**: Standard TanStack Query API, full cache management, graceful degradation

### 3. Dependency Graph Enhancement
- **Added**: Data source dependency tracking (`registerLineDataSourceDependency`, `getAffectedLinesByDataSource`)
- **Enhanced**: `LineCache` to support composite keys (`lineNumber:expression`)
- **Result**: Infrastructure for granular reactivity (populated during parsing)

### 4. Line Cache Refactoring
- **Changed**: Key type from `number` to `string` to support multiple expressions per line
- **Added**: `removeAllForLine()` method for clearing all expressions on a line
- **Result**: Correct handling of lines with multiple inline solves

### 5. Reactivity System
- **Implemented**: Event-driven cache updates in `DataQueryService`
- **Integrated**: `MarkdownEditorViewPlugin` subscribes to cache updates
- **Result**: Real-time UI updates when async data arrives

### 6. Plugin System
- **Refactored**: `CurrencyExchangeService` to use new event system
- **Implemented**: Subscription support via cache update events
- **Result**: Plugins work seamlessly with new architecture

## Test Results
All 1093 tests pass, including:
- Currency exchange functionality
- Expression engine caching and re-evaluation
- Line tracking and position tracking
- Long document robustness
- Markdown editor plugin integration

## Performance Characteristics
- **Main Thread Responsiveness**: Offloaded I/O to worker
- **Memory Usage**: Single cache (main thread only)
- **Cache Efficiency**: TanStack Query automatic management
- **Reactivity**: Event-driven updates (granular dependency tracking available)

## Future Enhancements
- Populate dependency graph during VM execution (requires VM context modification)
- Implement granular line re-evaluation (requires expression tracking in dependency graph)
