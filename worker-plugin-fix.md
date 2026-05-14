# Fix for DataCloneError in Worker Plugin Registration

## Problem
The refactored `DataQueryWorker` attempted to register plugins by sending function objects through `postMessage`. JavaScript's structured clone algorithm cannot clone functions, resulting in:
```
Uncaught DataCloneError: Failed to execute 'postMessage' on 'Worker': async (context) => { ... } could not be cloned.
```

## Root Cause
The original architecture allowed plugins to be registered with the worker by passing `PluginRegistration` objects containing `queryFunction` callbacks. This worked when the worker was instantiated in the same context, but fails when using `new Worker(url)` because:
1. Workers run in a separate global scope
2. `postMessage` uses structured cloning which doesn't support functions
3. Functions cannot be serialized/deserialized across thread boundaries

## Solution
Since we cannot pass functions to workers, we moved plugin logic into the worker itself:

### 1. DataQueryWorker.ts Changes
- **Removed**: `PluginRegistration` interface and plugin management logic
- **Added**: Native handling for known data source types (e.g., "currency")
- **Implemented**: `handleCurrencyQuery()` method that directly executes currency conversion logic

### 2. DataQueryService.ts Changes
- **Removed**: `registerPlugin()` and `unregisterPlugin()` methods from public API
- **Added**: No-op stubs with deprecation warnings for backward compatibility
- **Maintained**: `DataSourceConfig` export for external consumers

### 3. CurrencyExchangeService.ts Changes
- **Removed**: `registerCurrencyPlugin()` call in constructor
- **Removed**: `calculateRate()` helper method (logic moved to worker)
- **Maintained**: Same public API for `getRate()`, `getRateSync()`, etc.

## Impact
- **Pros**:
  - Eliminates DataCloneError
  - Worker is now truly generic and independent of application logic
  - Simpler architecture with fewer message types
  
- **Cons**:
  - Worker must know about specific data source types (coupling)
  - Adding new data sources requires modifying worker code
  - Less flexible plugin architecture

## Alternative Approaches Considered
1. **Main-thread execution**: Have worker delegate plugin execution back to main thread (adds latency)
2. **String-based plugins**: Define plugins via configuration strings (limited flexibility)
3. **Import scripts in worker**: Dynamically import plugin scripts (complex, security concerns)

## Recommendation
This solution is appropriate for the current architecture where:
- Currency conversion is a core feature
- Few data source types exist
- Performance is critical (avoiding round-trips)

For a more extensible plugin system in the future, consider implementing a message-based RPC system where the worker can request execution of specific functions from the main thread.
