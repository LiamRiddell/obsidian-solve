# IMPLEMENTATION PLAN: TypeScript Package Configuration for npm Publication

## GAP 3.6.5: No TypeScript Path Mapping for npm Consumption
**File(s)**: `src/solve-js/package.json`, `tsconfig.json`, `src/solve-js/src/index.ts`

## Problem
The project uses `@solve-js/*` path aliases that work in development but won't resolve when consumers import `solve-js` as an npm package. There's no `"types"` or `"exports"` field in package.json. No `.d.ts` declaration files are generated.

## Implementation Steps

### Step 1: Update package.json (1 hour)
- [ ] Add required fields:
  ```json
  {
    "name": "@solve-js/core",
    "version": "0.1.0",
    "main": "dist/index.cjs",
    "module": "dist/index.esm.js",
    "types": "dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.esm.js",
        "require": "./dist/index.cjs",
        "types": "./dist/index.d.ts"
      },
      "./lexer": {
        "import": "./dist/lexer/index.esm.js",
        "require": "./dist/lexer/index.cjs",
        "types": "./dist/lexer/index.d.ts"
      }
    },
    "files": ["dist/"],
    "typings": "dist/index.d.ts"
  }
  ```
- [ ] Note: Consider renaming package to `@solve-js/core` for npm publication

### Step 2: Update tsconfig.json (30 min)
- [ ] Add declaration generation:
  ```json
  {
    "compilerOptions": {
      "declaration": true,
      "declarationDir": "dist",
      "emitDeclarationOnly": false,
      "outDir": "dist",
      "rootDir": "src"
    }
  }
  ```
- [ ] Choose one strategy:
  - **Option A**: Single tsconfig with `emitDeclarationOnly: false` (tsc compiles everything)
  - **Option B**: `emitDeclarationOnly: true` + esbuild for JS (current approach, add declarations separately)

### Step 3: Generate declaration files (30 min)
- [ ] Add build step: `tsc --declaration --emitDeclarationOnly --outDir dist`
- [ ] Verify declaration files are generated correctly
- [ ] Check that path aliases are properly resolved in `.d.ts` output

### Step 4: Build configuration for multiple entry points (1 hour)
- [ ] Configure esbuild to produce:
  - `dist/index.cjs` (CommonJS bundle)
  - `dist/index.esm.js` (ESM bundle)
- [ ] Or use a bundler like `tsup` or `unbuild` that handles dual CJS/ESM

### Step 5: Update exports map in index.ts (30 min)
- [ ] Ensure `src/index.ts` exports ALL public API
- [ ] Currently missing: `PollingEngine`, `RateCache`, `HttpDataSource`, `ConfigManager`, etc.
- [ ] Add explicit exports for everything a consumer might need

### Step 6: Create test consumer project (1 hour)
- [ ] Create a separate test project that imports from the built package
- [ ] Verify `import { ExpressionEngine } from '@solve-js/core'` works
- [ ] Verify `import { Lexer } from '@solve-js/core/lexer'` works (path-based export)

### Step 7: Add prepare/publish scripts (30 min)
- [ ] Add `prepublishOnly` script that builds and runs tests
- [ ] Add `publish:core` script to the root package.json

## Acceptance Criteria
- [ ] Package can be imported from a fresh Node.js project using `@solve-js/core`
- [ ] TypeScript auto-completion works for all exported types
- [ ] Both CJS and ESM imports work
- [ ] All type declarations are accurate (no `any` in generated `.d.ts`)
- [ ] Existing tests still pass after changes

## Risk Level: Low
## Estimated Time: 4-5 hours

## Notes
- This is a prerequisite for the npm release
- The Obsidian plugin will continue to use the bundled `solve-js` import — this change only affects external consumers
- Consider using `unbuild` or `tsup` instead of manual esbuild+tsc for simpler dual-format builds