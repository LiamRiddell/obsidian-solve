# IMPLEMENTATION PLAN: Plugin System Integration

## GAP 3.3.1 / 3.3.2 / 3.3.3: Plugin System Disconnected from Engine
**File(s)**: `src/solve-js/src/engine/ExpressionEngine.ts`, `src/solve-js/src/plugins/PluginSystem.ts`, `src/solve-js/src/api/SolveAPI.ts`

## Problem
The `PluginManager`, `ProviderPackage`, and `PluginDiscovery` classes exist but are completely disconnected from the `ExpressionEngine`. The engine hardcodes all 9 providers in its constructor. Users cannot add/remove providers at runtime. The `ISolvePackage` interface is incomplete.

## Implementation Steps

### Step 1: Define plugin lifecycle interface (1 hour)
- [ ] Add to `PluginSystem.ts`:
  ```typescript
  interface PluginLifecycle {
    register(registry: ParseletRegistry, opRegistry: OpRegistry): void;
    unregister?(registry: ParseletRegistry, opRegistry: OpRegistry): void;
    onActivate?(): void;
    onDeactivate?(): void;
  }
  ```
- [ ] Extend `SolvePlugin` with optional lifecycle methods
- [ ] Add `dependencies` and `version` fields for plugin compatibility

### Step 2: Extend ISolvePackage (1 hour)
- [ ] Add optional fields:
  - `opcodeHandlers?: IOpcodeHandlerRegistration[]` (already exists)
  - `dataSources?: DataSourceConfig[]` (for custom data sources)
  - `tokenTypes?: { type: string; regex: RegExp }[]` (for new lexer tokens — advanced, defer)
  - `config?: Record<string, unknown>` (plugin-specific settings)
- [ ] Update `Solve.registerPackage()` to handle new fields
- [ ] Update `PluginManager.register()` to handle data sources

### Step 3: Modify ExpressionEngine constructor (2 hours)
- [ ] Add optional `plugins` parameter:
  ```typescript
  constructor(localeCode = "en", diagnosticMode = false, plugins?: SolvePlugin[]) {
    // ... existing setup
    // Register built-in providers (current behavior)
    this.registerBuiltInProviders();
    // Register additional plugins
    if (plugins) {
      for (const plugin of plugins) {
        this.pluginManager.register(plugin);
      }
    }
  }
  ```
- [ ] Create `private pluginManager: PluginManager` in ExpressionEngine
- [ ] Extract provider registration into `registerBuiltInProviders()` method
- [ ] Add plugin bytecode invalidation: when a plugin is registered/unregistered, clear bytecode cache

### Step 4: Add runtime plugin management methods (1 hour)
- [ ] `ExpressionEngine.registerPlugin(plugin: SolvePlugin): void`
- [ ] `ExpressionEngine.unregisterPlugin(name: string): void`
- [ ] Both methods should:
  - Update the ParseletRegistry
  - Update the OpRegistry
  - Invalidate bytecode cache (since opcodes may have changed)
  - Invalidate line cache (since parse results may change)

### Step 5: Wire PluginDiscovery (30 min)
- [ ] Implement `PluginDiscovery.discoverFromDirectory()` (for Node.js/Obsidian environments)
- [ ] Implement `PluginDiscovery.discoverFromPackages()` (for npm-based environments)
- [ ] Add optional `autoDiscover` parameter to ExpressionEngine constructor

### Step 6: Update SolveAPI singleton (1 hour)
- [ ] The `solve` singleton should share the same registry/state as the engine
- [ ] Either make the engine use the shared registries, or update `Solve` to support multi-engine scenarios
- [ ] Document: `Solve` singleton is for simple single-engine use; for multi-engine, use `ExpressionEngine` directly

### Step 7: Write tests (2 hours)
- [ ] Test: register a custom parselet, parse an expression using it
- [ ] Test: unregister a parselet, verify expressions using it fail gracefully
- [ ] Test: register a plugin with opcode handlers
- [ ] Test: register a plugin with data sources
- [ ] Test: engine with plugins parameter in constructor
- [ ] Test: runtime plugin registration/deregistration
- [ ] Test: register + unregister + re-register (ensure cleanup)
- [ ] Test: plugin with the same name throws error

## Acceptance Criteria
- [ ] ExpressionEngine accepts `plugins` parameter in constructor
- [ ] `ExpressionEngine.registerPlugin()` works at runtime
- [ ] `ExpressionEngine.unregisterPlugin()` works at runtime
- [ ] ISolvePackage supports opcodeHandlers and dataSources
- [ ] Plugin registration invalidates caches correctly
- [ ] All existing tests still pass
- [ ] New plugin tests pass

## Risk Level: Medium
## Estimated Time: 8-10 hours

## Notes
- This plan does NOT include extending lexer tokens dynamically — that's a larger change requiring moo lexer modification
- Focus on parselet + opcode extensibility first — that's the most common ask
- The `PluginDiscovery` system can remain as-is (returns empty array) until a real plugin marketplace exists