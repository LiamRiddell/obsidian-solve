# solve-js — Project Code & Architecture Documentation

> **Core Engine for the solve Expression Parser Ecosystem**
> Backend for obsidian-solve, future CLI/MCP/RCP interfaces

---

## 1. Project Goals

| Goal | Description |
|------|-------------|
| **Speed** | Millisecond-level expression evaluation via bytecode-compiled VM, single-pass document parsing, and multi-layer caching |
| **Maintainability** | Clean separation of concerns — lexer → parser → bytecode → VM — with well-defined interfaces and plugin architecture |
| **Flexibility** | Pluggable provider system for arithmetic, percentages, UoM, datetime, dice, vectors, big integers, and functions |
| **Performance** | Worker-based data fetching, expression caching, dependency graph for incremental re-evaluation |
| **Production Readiness** | Unified error framework with severity levels and recovery strategies, graceful degradation |
| **Enterprise Scalability** | Configurable caching policies, multi-source data orchestration, TanStack Query integration |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend Interfaces                    │
│  obsidian-solve (Obsidian plugin)                        │
│  Future: CLI, MCP Server, RPC, Web Component             │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   ExpressionEngine   │  ← Core orchestrator
              │  (ExpressionEngine)  │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  Lexer  │   │  Parser   │   │   VM      │
    │(moo-based)│ │(Pratt     │   │(Stack     │
    │         │   │  descent) │   │ based)    │
    └────┬────┘   └─────┬─────┘   └─────┬─────┘
         │               │               │
    ┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  Cache  │   │  Bytecode │   │  OpRegistry│
    │ Layer   │   │  Builder  │   │  + Plugins │
    └─────────┘   └───────────┘   └───────────┘
```

---

## 3. Core Modules

### 3.1 Lexer (`src/solve-js/src/lexer/`)

- **`Lexer.ts`** — Main entry point. Wraps `MarkdownLexer` with peek/buffer support and provides `getHighlightTokens()` for CodeMirror integration. Exports `sharedLexer` singleton.
- **`MarkdownLexer.ts`** — Built on the `moo` tokenizer library. Supports multiple states: `main`, `expression`, `heading`, `blockquote`, `list_item`, `inline`, `inline_solve`. Handles markdown syntax, inline solves (`s\`...\``), unicode math symbols (x, /, =), hex/binary literals, and keyword operators.
- **`ExpressionLexer.ts`** — Simplified wrapper for raw expression parsing (no markdown awareness).
- **`Token.ts`** — Token type definitions. 55+ token types defined in `TokenTypes` const object.
- **`LexerState.ts`** — Enum: `Main`, `Inline`, `String`.
- **`units.ts`** — Known unit set (~120 units) with `isKnownUnit()` helper.
- **`TokenHighlightMap.ts`** — Maps token types to CodeMirror CSS classes.
- **`registry/TokenRegistry.ts`** — Shared token type registry (unused in current code, placeholder).

### 3.2 Parser (`src/solve-js/src/parser/`)

- **`Parser.ts`** — Pratt (top-down operator precedence) parser. Core methods:
  - `parseExpression(bindingPower, builder)` — Parses expression with given minimum binding power.
  - `consume(expectedType?)` — Consumes and returns next token, optionally asserting type.
  - `match(expectedType)` — Consumes next token if it matches, returns boolean.
  - `peek()` / `previous()` — Lookahead and lookbehind.
- **`BytecodeBuilder.ts`** — Assembles bytecode program with three data segments:
  - `opcodes` — Uint8Array instruction stream
  - `numbers` — Float64Array numeric constants
  - `strings` — string[] string constants (interned via `stringIndex` Map)
  - `constants` — Map for future use
- **`OpCode.ts`** — 35+ opcodes organized by category: Stack, Push literals, Arithmetic, Bitwise, Comparison, Functions, Variables, Type conversion, UoM, Datetime, Vector, Dice, Plugin custom.
- **`Parselet.ts`** — `PrefixParselet` and `InfixParselet` interfaces.
- **`BindingPower.ts`** — Precedence levels: `Lowest(0)`, `Assignment(10)`, `Conditional(20)`, `Sum(30)`, `Product(40)`, `Exponent(50)`, `Prefix(60)`, `Postfix(70)`, `Call(80)`.
- **`registry/ParseletRegistry.ts`** — Maps token types to prefix/infix parselets. Shared singleton `sharedParseletRegistry`.

### 3.3 VM (`src/solve-js/src/vm/`)

- **`VM.ts`** — Stack-based virtual machine. Core function `executeBytecode(bytecode, vm)` uses a `while(ip < opcodes.length)` loop with a giant switch on OpCode.
  - Supports 35+ opcodes inline.
  - Plugin opcodes (`>= PLUGIN_CUSTOM = 200`) dispatched to registered handlers.
  - All builtin functions (37 Math functions) implemented as index-based dispatch via `builtinFunctions[]` array.
  - Key helper: `unifyUom()` for unit-aware binary operations.
- **`Value.ts`** — Tagged union type with 12 value types: `Number(0)`, `Hex(1)`, `BigInt(2)`, `String(3)`, `Datetime(4)`, `Percentage(5)`, `Uom(6)`, `Vector2(7)`, `Vector3(8)`, `Vector4(9)`, `Boolean(10)`, `Unit(11)`.
  - Factory functions: `numberValue()`, `hexValue()`, `bigIntValue()`, `stringValue()`, `uomValue()`, `vectorValue()`.
- **`OpRegistry.ts`** — Maps OpCode to plugin handler functions. Shared singleton `sharedOpRegistry`.
- **`ScopeManager.ts`** — Manages variable scope with line-aware definitions. Supports shadowing by line number and `invalidateDownstream()`.
- **`DependencyGraph.ts`** — Tracks variable and data source dependencies between lines. BFS-based `getAffectedLines()` for incremental re-evaluation. Also tracks `dataSourceDependencies`.
- **`MemoCache.ts`** — Epoch-based memoization. Hash is `expr + line`. Epoch bump invalidates all entries.

### 3.4 Engine (`src/solve-js/src/engine/`)

- **`ExpressionEngine.ts`** — Central orchestrator. Key methods:
  - `constructor(localeCode, diagnosticMode)` — Creates Lexer, ParseletRegistry, Parser, VM. Registers all built-in providers.
  - `parseDocument(input, options)` — Single-pass document parsing. Returns `ParsingResult` with per-line results, coordinates, and errors.
  - `evaluateLine(lineNumber, expression)` / `evaluateLineWithDebug(...)` — Evaluates single expression.
  - `reEvaluateLine(lineNumber, expression)` — Re-executes cached bytecode.
  - `markDirtyFromVariable(variable)` — Marks downstream lines dirty via DAG.

### 3.5 Providers (9 built-in)

Each provider has a `registerXxxParselets(registry)` function:

1. **Arithmetic** — `NumberParselet`, `PrefixOpParselet` (unary +/-), `BinaryOpParselet` (+,-,*,/,^,mod,<<,>>,&,|), `GroupParselet` (parentheses), `ConstantParselet` (pi, e)
2. **Percentage** — `PercentParselet` (5% = /100), `OfParselet` (X% of Y), `IncreaseDecreaseParselet` (increase/decrease by), `PercentageChangeParselet` (X to Y)
3. **Function** — `FunctionCallParselet` — 37 Math functions mapped to `CALL_BUILTIN` opcode
4. **Datetime** — `NowParselet`, `NextLastParselet`
5. **UoM** — `UomLiteralParselet` (unit tagging/conversion), `ConvertParselet` (explicit convert), `CurrencySymbolParselet` ($, , EUR)
6. **Vector** — `VectorParselet` (vec2/3/4), `VectorAddParselet`, `VectorSubParselet`, `VectorDotParselet`
7. **BigInteger** — `BigIntNumberParselet` (42n syntax)
8. **Dice** — `DiceRollParselet` (roll(1,6) / roll between/from), `DiceRangeParselet`
9. **Variables** — `VariableParselet` (:var syntax)

### 3.6 Cache Layer (`src/solve-js/src/cache/`)

- **`LineCache.ts`** — Per-line cache with `BytecodeSnapshot`, `readVariables`, `writeVariable`, `dirty` flag. Key: `"line:expression"`.
- **`UnifiedCache.ts`** — Generic cache with configurable policies (LRU/LFU/TTL). Also contains `ExpressionCache` (tokenization result cache) and `DocumentCache` (full document parse results, max 100 entries, 5min TTL).
- **`LFUCache.ts`** — Standalone LFU cache implementation.

### 3.7 Worker & Data Layer

- **`WorkerInterface.ts`** — `IWorker`, `WorkerMessage`, `WorkerResponse`, `WorkerFactory` interfaces.
- **`default.ts`** — `DefaultWorker` (Web Worker wrapper), `DefaultWorkerFactory`, `createWorkerFromModule()`.
- **`DataSourceStrategy.ts`** — Strategy pattern with `CurrencyDataSource`, `HttpDataSource`, `ConfigurableWorker`, `WorkerPool`.
- **`DataQueryWorker.ts`** — High-level worker managing data sources and messages.
- **`DataQueryService.ts`** — Orchestrates workers, local caching, TanStack Query integration. Singleton `dataQueryService`.
- **`CurrencyExchange.ts`** — `CurrencyExchangeService` singleton handling rate fetching, conversion, subscriptions. Uses `dataQueryService`.

### 3.8 UoM (`src/solve-js/src/uom/`)

- **`UomConverter.ts`** — `resolveUnit()`, `getMeasure()`, `canConvert()`, `convertUnit()`, `isConvertibleUnit()`, `getBestUnit()`. Uses `convert` npm package v7.
- **`CurrencyExchange.ts`** — (See above)

### 3.9 Format (`src/solve-js/src/format/`)

- **`FormatEngine.ts`** — `formatValue(value, settings?)` — switches on `ValueType` to format output.
- **`FormattingSettings.ts`** — `FormattingSettings` interface and `DEFAULT_FORMATTING_SETTINGS`.

### 3.10 Error Handling

- **`UnifiedErrorFramework.ts`** — 6 error categories, 4 severity levels, 5 recovery strategies. `SolveError` class, `ErrorFactory`, `ErrorRecoveryManager`.

### 3.11 API & Plugin System

- **`SolveAPI.ts`** — `Solve` singleton. Methods: `registerPrefixParselet`, `registerInfixParselet`, `registerOpcodeHandler`, `registerVariableSource`, `registerPackage`.
- **`PluginSystem.ts`** — `PluginManager`, `ProviderPackage`, `PluginDiscovery`, `PluginRegistry`.
- **`GrammarDSL.ts`** — DSL for defining grammars programmatically.

### 3.12 Configuration

- **`Configuration.ts`** — `EngineConfig` with sub-sections. `ConfigManager` with get/set by dot-path, merge, validate, reset.

### 3.13 Types

- **`ParsingResult.ts`** — `InlineSolvePosition`, `ParsedLine`, `ParsingResult`, `UnifiedParsingOptions`, `ParseletInfo`, `DebugInfo`.
- **`core.ts`** — Branded types: `CurrencyCode`, `VariableName`, `ExpressionHash`, `LineNumber`.

---

## 4. Frontend: obsidian-solve

The Obsidian plugin lives in `src/app/`:

- **`main.ts`** — Plugin entry point
- **`MarkdownEditorViewPlugin.ts`** — CodeMirror 6 plugin. Calls `parseDocument()` per line. Renders result widgets inline after `` s`...` `` expressions. Adds syntax highlight decorations. Subscribes to `dataQueryService.onCacheUpdate()`.
- **`SolveHighlightProvider.ts`** — Wraps `expressionEngine.getLexer().getHighlightTokens()` with its own cache.
- **`ExpressionResultWidget.ts`** — CodeMirror widget for inline results.
- **Settings** — Detailed per-provider settings in `src/app/settings/`.

---

## 5. Test Suite

42 test files across these categories:

| Category | Files | Focus |
|----------|-------|-------|
| Core Engine | `ExpressionEngine`, `LineTracking`, `FullPipeline`, `MixedArithmetic`, `DiagnosticMode`, `LongDocumentRobustness` | Integration & correctness |
| VM | `VM`, `VMResilience`, `Value`, `MemoCache`, `DependencyGraph`, `ScopeManager` | Opcode correctness, resilience |
| Parser | `Parser`, `BytecodeBuilder`, `BindingPower` | Bytecode generation |
| Lexer | `Lexer`, `LexerFuzz`, `TokenTypes`, `TokenHighlightMap`, `LexerState` | Tokenization |
| Providers (9) | Arithmetic, Percentage, Datetime, Dice, BigInteger, Variables, UoM, Vector, Function | Per-provider correctness |
| Infrastructure | `LineCache`, `UomConverter`, `CurrencyExchange`, `VariableResolver` | Caching, conversion, resolution |
| Codemirror | `MarkdownEditorViewPlugin`, `SolveHighlightProvider` | Editor integration |
| API | `SolveAPI` | Plugin API |
| Format | `format_timespan` | Output formatting |

---

## 6. Dependency Graph

```
solve-js (core npm package)
  ├── moo (lexer)
  ├── convert (unit conversion)
  ├── @tanstack/query-core (data caching)
  └── moment (datetime — app layer only)
      
obsidian-solve (Obsidian plugin)
  ├── solve-js (above)
  ├── @codemirror/* (editor)
  ├── animate.css (UI)
  └── convert, moment (shared)
```

---

## 7. Build System

- **Bundler**: esbuild via `esbuild.config.mjs`
- **Language**: TypeScript 5.1
- **Testing**: Jest + ts-jest
- **Linting**: ESLint with typescript-eslint parser
- **Formatting**: Prettier
- **Path aliases**: `@solve-js/*` mapped to `src/solve-js/src/*`, `@app/*` mapped to `src/app/*`