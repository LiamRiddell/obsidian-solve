# Plan 05: Jest Memory Fix

## Status: DONE ✅

## Problem
Jest tests (especially `LexerPluginFuzz.spec.ts`) run out of memory even on 64GB RAM.
This is caused by Jest's default worker model not properly releasing memory between
test suites.

## Solution (from StackOverflow answers)

Three changes applied:

1. **`jest.config.js`**: Added `workerIdleMemoryLimit: '512MB'` to force Jest to recycle
   workers when they exceed 512MB heap. Also added `maxWorkers: 2` to limit parallelism.

2. **`jest.config.js` `ts-jest` transform**: Added `isolatedModules: true` to reduce
   per-module memory overhead from TypeScript compilation.

3. **`package.json` scripts**: Updated `test:engine` script to use `--expose-gc` and
   `--logHeapUsage` for memory diagnostics. Added `test:light` for running lighter test
   subsets without the fuzz test.

## References
- https://stackoverflow.com/questions/62885390/my-jests-tests-are-leaking-memory-how-can-i-fix-this
- https://stackoverflow.com/a/78207777
