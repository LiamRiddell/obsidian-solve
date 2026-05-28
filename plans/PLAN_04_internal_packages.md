# Plan 04: Internal Shipped Packages via ISolvePackage

## Status: DONE ✅

## Problem
Currently in `ExpressionEngine.ts` constructor, built-in providers are registered individually:
```typescript
registerArithmeticParselets(this.registry);
registerPercentageParselets(this.registry);
registerFunctionParselets(this.registry);
registerDatetimeParselets(this.registry);
registerDiceParselets(this.registry);
registerVariableParselets(this.registry);
registerUomParselets(this.registry);
registerVectorParselets(this.registry);
registerBigIntParselets(this.registry);
```

This doesn't use the `ISolvePackage`/`SolvePlugin` system that's available for external plugins.
Internal providers should use the same system so they can be:
- Enabled/disabled
- Extended by external plugins (replace built-in arithmetic with custom)
- Introspected (list all loaded packages)
- Registered through `SolveAPI.registerPackage()` which handles lexer plugins, parselets, opcodes, and variables

## Design

Each built-in provider becomes an `ISolvePackage` object. The engine registers them via
`this.solve.registerPackage(package)` instead of calling individual `register*Parselets()` functions.

A new `src/solve-js/src/providers/builtins.ts` file exports all built-in packages as a single array.

The `ExpressionEngine` constructor replaces the 9 individual registration calls with:
```typescript
for (const pkg of BUILTIN_PACKAGES) {
    this.solve.registerPackage(pkg);
}
```

Each provider's `index.ts` exports both the individual registration function (for backward compat)
and an `ISolvePackage` object.

## Changes Made

1. **Created `src/solve-js/src/providers/builtins.ts`**: Aggregates all 9 built-in providers as
   `ISolvePackage` objects in a `BUILTIN_PACKAGES` array.

2. **Updated each provider's `index.ts`**: Added an exported `ISolvePackage` constant alongside
   the existing `register*Parselets()` function (preserving backward compatibility).

3. **Updated `ExpressionEngine.ts`**: Replaced 9 individual `register*Parselets()` calls with
   a single loop over `BUILTIN_PACKAGES` using `SolveAPI`.

## Benefits
- Consistent plugin architecture: internal and external packages use the same system
- Enables selective disable of built-in providers
- Enables external packages to replace/extend built-in ones
- Cleaner engine initialization
- Package introspection via `PluginManager.getPlugins()`
