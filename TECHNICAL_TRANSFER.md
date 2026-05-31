# Solve — Technical Transfer Document

> **Audience:** Maintainers, collaborators, and new contributors onboarding to the codebase.
> **Last Updated:** May 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Directory Map](#2-directory-map)
3. [Architecture Overview](#3-architecture-overview)
4. [The Expression Pipeline](#4-the-expression-pipeline)
5. [Plugin & Provider System](#5-plugin--provider-system)
6. [Document Model & Three-Tier Evaluation](#6-document-model--three-tier-evaluation)
7. [Async Resolution System](#7-async-resolution-system)
8. [Worker Infrastructure](#8-worker-infrastructure)
9. [Obsidian Integration Layer](#9-obsidian-integration-layer)
10. [Performance Architecture](#10-performance-architecture)
11. [Build, Test & Release Pipeline](#11-build-test--release-pipeline)
12. [Contributing Guide](#12-contributing-guide)

---

## 1. Executive Summary

**Solve** is an Obsidian plugin that evaluates mathematical expressions, unit conversions, datetime arithmetic, percentages, dice rolls, vector math, and currency conversions — all inline, in real time, as the user types in their notes.

It works by intercepting every keystroke in CodeMirror (Obsidian's editor), lexing/parsing/compiling each line into bytecode, executing that bytecode on a stack-based VM, and rendering the result as a CodeMirror decoration at the end of each line.

The architecture is designed around three key principles:

| Principle | Implementation |
|-----------|---------------|
| **Real-time at keystroke speed** | Three-tier evaluator: Tier 1 (full pipeline for visible+dirty lines), Tier 2 (bytecode-execute-only for cached lines), Tier 3 (compile-only for invisible lines) |
| **Extensible via plugins** | Provider package system: parselets, opcode handlers, variable sources, async resolvers — all registered through a unified `ISolvePackage` interface |
| **Safe by default** | Configurable limits on expression length, complexity, nesting depth, stack depth, and instruction count — with graceful error handling throughout |

---

## 2. Directory Map

```
src/
├── solve-js/src/                    # Core engine (platform-agnostic)
│   ├── index.ts                     # Main entry: exports ExpressionEngine, SolveAPI, types
│   ├── api/
│   │   └── SolveAPI.ts              # ISolvePackage interface + Solve class (plugin registry)
│   ├── engine/
│   │   ├── ExpressionEngine.ts      # Central orchestrator (~1600 lines)
│   │   ├── DocumentModel.ts         # Persistent line model with SegmentTree
│   │   ├── ThreeTierEvaluator.ts    # Tier 1/2/3 evaluation strategy
│   │   ├── AsyncResolutionBatcher.ts # Micro-batches async resolutions
│   │   ├── ExecutionPool.ts         # Worker pool for VM offloading
│   │   ├── CompilationWorkerManager.ts # Background bytecode compilation
│   │   ├── PageManager.ts           # LRU page-based memory eviction
│   │   └── SegmentTree.ts           # Order-statistic treap
│   ├── lexer/
│   │   ├── ExpressionLexer.ts       # Tokenizer with plugin system
│   │   └── Lexer.ts                 # Shared lexer singleton
│   ├── parser/
│   │   ├── PrecedenceParser.ts      # Pratt parser with Tier-1 fast path
│   │   ├── Parser.ts                # Re-export of PrecedenceParser
│   │   ├── BindingPower.ts          # Operator binding power table
│   │   ├── OpCode.ts                # 200+ bytecode opcodes enum
│   │   ├── BytecodeBuilder.ts       # Compiles AST → TypedArray bytecode
│   │   ├── Parselet.ts              # Prefix/Infix parselet interfaces
│   │   └── registry/
│   │       └── ParseletRegistry.ts  # Token type → parselet registration
│   ├── vm/
│   │   ├── VM.ts                    # Stack machine: createVM() + executeBytecode()
│   │   ├── Value.ts                 # 12 value types + factory functions
│   │   ├── VMBuiltins.ts            # 37 built-in math functions
│   │   ├── VMConversion.ts          # Type coercion + UoM unification
│   │   ├── VMCheckpoints.ts         # Prototypal VM state snapshots
│   │   ├── OpRegistry.ts            # Extensible opcode handler registry
│   │   └── DependencyGraph.ts       # Bidirectional variable dependency DAG
│   ├── providers/                   # Built-in provider packages
│   │   ├── builtins.ts              # 11 packages: arithmetic, percentage, function,
│   │   │                            #   datetime, dice, variables, UOM, currency,
│   │   │                            #   vector, bigint, OSRS Grand Exchange
│   │   ├── arithmetic/parselets/    # Number, binary ops, grouping, constants
│   │   ├── percentage/parselets/    # %, of, increase/decrease, change
│   │   ├── function/parselets/      # Function calls: sin(30), cos(pi), etc.
│   │   ├── datetime/parselets/      # now, today, tomorrow, next/last day
│   │   ├── dice/parselets/          # roll(1, 100), roll between X and Y
│   │   ├── variables/parselets/     # :variable assignment, identifier loading
│   │   ├── uom/parselets/           # Unit literal, convert, currency, in
│   │   ├── vector/parselets/        # vec2/vec3/vec4, float alias
│   │   ├── biginteger/parselets/    # BigInt literals
│   │   └── osrs/                    # Old School RuneScape Grand Exchange demo
│   ├── uom/                         # Unit of Measurement subsystem
│   │   ├── UomConverter.ts          # convertUnit(), getMeasure(), getBestUnit()
│   │   ├── CurrencyExchange.ts      # Sync currency conversion
│   │   └── CurrencyResolver.ts      # Async currency resolver for CALL_PLUGIN
│   ├── services/
│   │   ├── CurrencyPollingService.ts # Polls currency rates periodically
│   │   └── DataQueryService.ts      # Generic async data query service
│   ├── workers/
│   │   ├── compilation.worker.ts    # Background bytecode compilation worker
│   │   ├── DataQueryWorker.worker.ts # Data query worker
│   │   ├── eval.worker.ts           # VM evaluation worker
│   │   ├── execution.worker.ts      # Batch VM execution worker
│   │   ├── default.ts               # Generic Worker wrapper
│   │   └── WorkerInterface.ts       # Worker message types
│   ├── cache/
│   │   ├── LineCache.ts             # Per-line bytecode + result cache
│   │   └── AsyncResultCache.ts      # Cache for async resolver results
│   ├── format/
│   │   └── FormatEngine.ts          # Value → display string formatting
│   └── __tests__/                   # 86 test suites, 2095+ tests
│       ├── engine/                  # BODMAS, configuration, pipeline, segment tree
│       ├── benchmarks/              # Lexer, parser, VM, pipeline benchmarks
│       ├── codemirror/              # Editor view plugin, highlight provider
│       ├── vm/                      # VM opcodes, Value, checkpoints
│       └── bugs/                    # Regression tests for specific issues
│
├── app/                             # Obsidian integration layer
│   ├── main.ts                      # SolvePlugin: Obsidian Plugin lifecycle
│   ├── codemirror/
│   │   └── MarkdownEditorViewPlugin.ts # CodeMirror ViewPlugin (keystroke handler)
│   ├── engine/
│   │   └── EngineProvider.ts        # Singleton ExpressionEngine factory
│   ├── settings/
│   │   ├── PluginSettings.ts        # Default settings + interface
│   │   ├── SettingsTab.ts           # Obsidian settings UI
│   │   └── UserSettings.ts          # Runtime settings singleton
│   ├── eventbus/
│   │   └── PluginEventBus.ts        # Simple pub/sub event bus
│   └── utilities/                   # Array, DateTime, Logger, String helpers
│
├── playground/                      # Standalone web demo (Vite + ESM)
├── benchmarks/                      # Benchmark suite (StatRunner, thresholds)
├── plans/                           # Architecture planning documents
├── skills/                          # AI assistant skill definitions
└── esbuild.config.mjs               # Build configuration
```

---

## 3. Architecture Overview

### 3.1 System Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OBSIDIAN HOST                                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                   SolvePlugin (main.ts)                          │ │
│  │  ┌───────────────────┐  ┌─────────────────┐  ┌───────────────┐  │ │
│  │  │   SettingsTab     │  │  PluginEventBus │  │  Commands     │  │ │
│  │  │   (settings UI)   │  │  (pub/sub)      │  │  (Ctrl+P)     │  │ │
│  │  └───────────────────┘  └─────────────────┘  └───────────────┘  │ │
│  └──────────────────────────┬───────────────────────────────────────┘ │
│                              │                                         │
│  ┌──────────────────────────▼───────────────────────────────────────┐ │
│  │              MarkdownEditorViewPlugin                            │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  • Intercepts every keystroke via CodeMirror ViewPlugin     │ │ │
│  │  │  • "One AbortController Per Keystroke" pattern               │ │ │
│  │  │  • Converts byte-offset changes → LineChange[]               │ │ │
│  │  │  • Builds result decorations from ThreeTierEvaluator         │ │ │
│  │  │  • Subscribes to async resolution events                     │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────┬───────────────────────────────────────┘ │
└─────────────────────────────┼─────────────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────────────┐
│                     SOLVE ENGINE (solve-js)                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    ExpressionEngine                              │ │
│  │  ┌───────────┐  ┌──────────┐  ┌────────┐  ┌─────────────────┐  │ │
│  │  │  Lexer    │→ │  Parser  │→ │Compiler│→ │   VM (stack)    │  │ │
│  │  │(tokenizer)│  │ (Pratt)  │  │→bytecode│  │ (executeBytecode)│ │
│  │  └───────────┘  └──────────┘  └────────┘  └─────────────────┘  │ │
│  │       ↑              ↑              ↑              ↑            │ │
│  │  LexerPlugin    Parselets    BytecodeBuilder  OpRegistry       │ │
│  │                     (Prefix/Infix)           (extensible)       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                   ThreeTierEvaluator                             │ │
│  │  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐  │ │
│  │  │DocumentModel │  │DependencyGraph │  │  VMCheckpointer     │  │ │
│  │  │(SegmentTree) │  │ (read/write)   │  │ (prototypal snaps)  │  │ │
│  │  └──────────────┘  └────────────────┘  └─────────────────────┘  │ │
│  │                                                                   │ │
│  │  Tier 1: Visible + Dirty    → Lex → Parse → Compile → Execute   │ │
│  │  Tier 2: Visible + Cached   → Execute bytecode (fast)            │ │
│  │  Tier 3: Invisible + Dirty  → Compile-only (background)          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow (Per Keystroke)

```
User types "2 + 2"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. MarkdownEditorViewPlugin.update()                        │
│    • Aborts previous keystroke's AbortController            │
│    • Converts CodeMirror changes → LineChange[]             │
│    • Calls evaluator.applyTransaction(changes)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ 2. ThreeTierEvaluator.applyTransaction()                    │
│    • Collects DAG writes from deleted lines                 │
│    • Resolves downstream consumers → marks dirty by lineId  │
│    • Applies structural changes to DocumentModel             │
│    • Clears stale checkpoints + DAG                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ 3. ThreeTierEvaluator.evaluate(viewport)                     │
│    • For each line from 1 to viewport end:                   │
│      - Tier 1: Lex → Parse → Compile → Execute              │
│      - Tier 2: Execute cached bytecode                      │
│      - Tier 3: Compile-only (discover reads/writes)         │
│    • Creates VM checkpoints after variable definitions      │
│    • Evicts cold pages via PageManager                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ 4. MarkdownEditorViewPlugin.buildDecorations()              │
│    • Reads evaluator results from DocumentModel              │
│    • Formats values via FormatEngine                         │
│    • Builds CodeMirror DecorationSet (widgets at line end)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. The Expression Pipeline

The pipeline transforms a raw text expression into a computed result through four stages:

```
"10 + 20% of 200"  ──→  Token[]  ──→  OpCode[]  ──→  Bytecode  ──→  Value
    (Lexer)            (Parser)        (Compiler)        (VM)
```

### 4.1 Lexer (`ExpressionLexer.ts`)

**Input:** Raw text string
**Output:** Array of `Token` objects (type, value, offset, length)

The lexer uses a **plugin system** for extensibility. Built-in token types include:

| Token Type | Example | Used By |
|-----------|---------|---------|
| `NUMBER` | `42`, `3.14` | Arithmetic |
| `PLUS`, `MINUS`, `STAR`, `SLASH` | `+`, `-`, `*`, `/` | Arithmetic |
| `CARET` | `^` | Exponentiation |
| `PERCENT` | `%` | Percentage |
| `LPAREN`, `RPAREN` | `(`, `)` | Grouping |
| `IDENT` | `myVar` | Variables |
| `COLON` | `:` | Variable definition |
| `FUNC` | `sin`, `cos` | Function calls |
| `UNIT` | `cm`, `kg`, `USD` | Unit of Measurement |
| `CONVERT` | `to` | UOM conversion |
| `NOW`, `TODAY`, `TOMORROW` | datetime keywords | Datetime |
| `ROLL`, `DICE` | dice keywords | Dice |
| `VEC2`, `VEC3`, `VEC4` | vector constructors | Vector |
| `BIGINT` | `0b10101` | BigInteger |
| `DOLLAR`, `POUND`, `EURO` | `$`, `£`, `€` | Currency |

**LexerPlugin Interface:**
```typescript
interface LexerPlugin {
  name: string;
  test: (char: string, position: number, line: string) => boolean;
  tokenize: (line: string, position: number) => Token | null;
}
```

Packages register lexer plugins to add custom token types. The lexer runs all plugins at each character position until one matches.

### 4.2 Parser (`PrecedenceParser.ts`)

**Input:** Token array
**Output:** Bytecode array (via BytecodeBuilder)

The parser is a **Pratt parser** (precedence climbing) with a two-tier dispatch:

#### Tier 1: Binding Power Fast Path

For common operators (`+`, `-`, `*`, `/`, `^`, `%`), the parser skips the registry lookup entirely and uses a hardcoded binding power table:

```
Operator    Binding Power    Associativity
─────────────────────────────────────────
+  -        1 (Sum)          Left
*  /  %     2 (Product)      Left
^           3 (Exponent)     Right
```

This covers >90% of real-world expressions with zero hash-map lookups.

#### Tier 2: Registry Lookup

For all other tokens (functions, units, keywords, custom operators), the parser queries the `ParseletRegistry` for prefix/infix parselets registered by provider packages.

**Prefix Parselet:** Consumed when a token starts an expression (e.g., `sin` in `sin(30)`, `$` in `$100`)
**Infix Parselet:** Consumed when a token appears between operands (e.g., `in` in `100 USD in GBP`, `of` in `10% of 200`)

```
Pseudo-code for parseExpression(minBp):
  ┌─ Prefix: consume first token
  │   • NUMBER → push literal
  │   • IDENT  → LOAD_VAR
  │   • LPAREN → recurse, expect RPAREN
  │   • MINUS  → recurse(Prefix), emit NEG
  │   • FUNC   → dispatch to FunctionCallParselet
  │   • etc.
  │
  └─ Infix loop: while next token's bp > minBp
      • Emit binary opcode from BP_TABLE (Tier 1 fast path)
      • OR dispatch to infix parselet (Tier 2 registry path)
```

### 4.3 Bytecode Compiler (`BytecodeBuilder.ts`)

The parser emits opcodes through a `BytecodeBuilder` that packs the IR into TypedArrays:

```typescript
interface BytecodeProgram {
  opcodes: Uint8Array;    // OpCode values (0-255)
  numbers: Float64Array;  // Numeric literals
  strings: string[];      // Identifiers, units, BigInt strings
}
```

This packed format is:
- **Transferable** via `postMessage` (zero-copy to Web Workers)
- **Cache-friendly** (contiguous memory, no pointer chasing)
- **Compact** (~20-50 bytes per expression on average)

### 4.4 Virtual Machine (`VM.ts`)

**Input:** BytecodeProgram
**Output:** Value (or pending promise)

The VM is a **stack machine** with:
- A value stack (bounded by `maxStackDepth`, default 200)
- A variable store (Map<string, Value>)
- An instruction counter (bounded by `maxInstructions`, default 50,000)
- An AbortSignal for keystroke-level cancellation

**Execution Loop:**
```
while (ip < opcodes.length) {
  switch (opcodes[ip++]) {
    case ADD:  r=pop(); l=pop(); push(l+r); break;
    case LOAD_VAR: push(vm.getVar(strings[opcodes[ip++]])); break;
    case CALL_BUILTIN: fn=builtins[opcodes[ip++]]; push(fn(args)); break;
    case HALT: return { type: 'value', value: pop() };
    // ... 60+ more opcodes
  }
}
```

**Key VM Features:**

1. **Numeric Fast Path:** ADD/SUB/MUL check `l.type===Number && r.type===Number` — covers >90% of arithmetic with zero function calls.

2. **Type Coercion:** `binaryOp()` handles Number, BigInt, UoM, Vector, Datetime, and Percentage types with automatic promotion.

3. **Async Plugin Calls:** `CALL_PLUGIN` returns `{ type: 'pending', resolver: Promise<Value> }` instead of throwing. The engine resolves the promise before re-executing.

4. **Diagnostic Mode:** Optional `DiagnosticPipeline` traces every opcode execution (opcode name, IP, stack depth, instruction count) for debugging and heatmap generation.

5. **Value Arena:** During scroll (Tier 2), `isArenaActive()` gates `persistentValue()` calls to re-use Value objects across lines, avoiding allocation.

**Value Types (12 total):**

| Type | Internal Value | Example |
|------|---------------|---------|
| `Number` | `number` | `3.14` |
| `BigInt` | `bigint` | `0b10101` |
| `Hex` | `number` (display as hex) | `0xFF` |
| `String` | `string` | `"hello"` |
| `Boolean` | `boolean` | `true` |
| `Datetime` | `number` (epoch ms) | `2026-05-31` |
| `Percentage` | `number` (0-1) | `50%` |
| `Uom` | `number` + `unit: string` | `5 kg` |
| `Array` | `number[]` | `[1, 2, 3]` |
| `Error` | `message: string` | `Division by zero` |
| `Pending` | `queryKey: string` | Async not yet resolved |
| `Duration` | `number` (ms) | `5 days` |

---

## 5. Plugin & Provider System

Solve uses a **provider package** system where every feature (arithmetic, percentages, units, currency, etc.) is a self-contained package implementing `ISolvePackage`.

### 5.1 ISolvePackage Interface

```typescript
interface ISolvePackage {
  name: string;
  lexerPlugin?: LexerPlugin;          // Custom token type
  prefixParselets?: Array<{           // "Starts an expression"
    tokenType: string;
    parselet: PrefixParselet;
  }>;
  infixParselets?: Array<{            // "Between operands"
    tokenType: string;
    parselet: InfixParselet;
  }>;
  opcodeHandlers?: IOpcodeHandlerRegistration[];  // Custom VM opcodes
  variableSources?: IVariableSource[];            // External variable providers
  asyncResolver?: IAsyncResolver;                 // Async data (currency, etc.)
}
```

### 5.2 Built-in Packages (11 total)

```
Package              Token Types              Example Expression
────────────────────────────────────────────────────────────────
solve-arithmetic     NUMBER, +, -, *, /, ^    10 + 5 * 2
solve-percentage     %, of, to, inc/dec       10% of 200
solve-function       FUNC (sin, cos, sqrt)    sin(30) + cos(pi)
solve-datetime       NOW, TODAY, TOMORROW     today + 20 days
solve-dice           ROLL                    roll(1, 100)
solve-variables      COLON, IDENT            :x = 10, x + 5
solve-uom            UNIT, CONVERT           10cm + 5cm to m
solve-currency       DOLLAR, POUND, EURO     $100 in GBP
solve-vector         VEC2, VEC3, VEC4, FLOAT vec3(1, 2, 3) * 2
solve-bigint         BIGINT                  0b10101 >> 2
solve-osrs-ge        (custom keywords)       (OSRS Grand Exchange prices)
```

### 5.3 Registration Flow

```
ExpressionEngine constructor
  │
  ├─ new Lexer() → LexerPlugin[] from packages
  ├─ new ParseletRegistry() → Prefix/Infix parselets from packages
  ├─ new OpRegistry() → Custom opcode handlers from packages
  ├─ new VariableResolver() → Variable sources from packages
  └─ new ResolverRegistry() → Async resolvers from packages
       │
       └─ registerPackage(pkg) called for each BUILTIN_PACKAGE
```

### 5.4 Adding a New Provider

1. Create parselets in `src/solve-js/src/providers/<name>/parselets/`
2. Define the `ISolvePackage` object
3. Export it from `src/solve-js/src/providers/builtins.ts`
4. Add to the `BUILTIN_PACKAGES` array
5. Add settings toggle in `SettingsTab.ts`

External packages can also call `solve.registerPackage()` at runtime.

---

## 6. Document Model & Three-Tier Evaluation

### 6.1 DocumentModel

The `DocumentModel` is the persistent representation of the editor's content. Key design:

```
DocumentModel
├── Map<lineId, LineState>          # O(1) line lookup by persistent ID
├── SegmentTree (order-statistic treap) # O(log N) insert/delete/get-at-index
└── nextLineId: number              # Monotonically increasing counter
```

**Critical Invariant:** Line IDs never change. When the user inserts or deletes lines, only the SegmentTree ordering is updated — existing line IDs survive. This means:
- Bytecode cached by lineId stays valid
- Dependency graph entries keyed by lineId survive edits
- VM checkpoints remain correct

**LineState:**
```typescript
interface LineState {
  lineId: number;          // Immutable, survives structural edits
  textHash: number;        // djb2 hash for O(1) change detection
  text: string;            // Full line text (may include markdown)
  expression: string|null; // Extracted expression, or null
  bytecode: BytecodeProgram|null; // Compiled bytecode
  reads: string[];         // Variables this line reads
  writes: string[];        // Variables this line writes
  result: Value|null;      // Last evaluation result
  dirty: boolean;          // Needs re-evaluation
  isVariableDef: boolean;  // This line defines a variable
  isEmpty: boolean;        // Markdown-only, no expression
}
```

### 6.2 Three-Tier Evaluation Strategy

```
                    ┌──────────────────────────────────┐
                    │     Is the line VISIBLE?         │
                    └──────────────┬───────────────────┘
                          Yes │              │ No
                    ┌─────────▼──────┐  ┌────▼─────────────────┐
                    │  Is it DIRTY?  │  │   Is it DIRTY?       │
                    └────┬──────┬────┘  └────┬──────────┬──────┘
                    Yes  │      │ No       Yes │          │ No
              ┌──────────▼┐  ┌──▼────────┐ ┌───▼────────┐ ┌──▼──┐
              │  TIER 1   │  │  TIER 2   │ │  TIER 3    │ │SKIP │
              │           │  │           │ │            │ │     │
              │ Lex       │  │ Execute   │ │ Compile    │ │  -  │
              │ Parse     │  │ cached    │ │ only        │ │     │
              │ Compile   │  │ bytecode  │ │ (background│ │     │
              │ Execute   │  │           │ │  worker)   │ │     │
              │           │  │ ~0.1ms    │ │            │ │     │
              │ ~1-2ms    │  │           │ │ ~0.5ms     │ │     │
              └───────────┘  └───────────┘ └────────────┘ └─────┘
```

**Tier 1 — Full Pipeline:** For lines the user just typed or modified. Lex → Parse → Compile → Execute. After execution, bytecode is cached for future Tier 2 use.

**Tier 2 — Bytecode Execute-Only:** For clean lines that scroll into view. Skips lexing, parsing, and compiling — just runs the pre-compiled bytecode. Target: <0.1ms per line.

**Tier 3 — Background Compile:** For dirty lines below the viewport. Compiles to discover variable reads/writes (for the dependency graph) but doesn't execute display expressions. Variable definitions ARE executed (they affect VM state). Bytecode is stored in DocumentModel for future Tier 2.

### 6.3 Viewport-Only Scrolling (Tier 2 optimization)

When the user scrolls (no keystroke), the `setViewport()` method avoids re-evaluating the entire document:

```
setViewport(viewport):
  1. Check: any dirty lines before viewport? → Fall back to evaluate()
  2. Restore VM from nearest checkpoint before viewport.startLine
  3. Execute only the newly visible lines (Tier 2 for cached, Tier 1 for dirty)
  4. Dispatch background compiles for lines just beyond viewport
  5. PageManager evicts cold pages

Result: O(visible lines) instead of O(document length)
```

### 6.4 VMCheckpointer

Checkpoints use a **prototypal chain** for O(1) snapshots:

```
Line 1: :x = 10          → checkpoint[1] = { x: 10 }
Line 5: :y = x + 5       → checkpoint[5] = { y: 15, __proto__: checkpoint[1] }
Line 12: :z = x + y      → checkpoint[12] = { z: 25, __proto__: checkpoint[5] }

restoreTo(4):  Look up checkpoint[4] → walk chain → VM has { x: 10 }
restoreTo(10): Look up checkpoint[10] → walk chain → VM has { x: 10, y: 15 }
```

No cloning, no serialization — just prototype chain traversal. After checkpoint creation, the VM is mutated in place (the checkpoint stores snapshots of the variable map at that point).

### 6.5 PageManager (Memory Eviction)

The `PageManager` divides the document into fixed-size pages (default ~50 lines) and assigns each page a temperature:

| Temperature | Meaning | Action on Memory Pressure |
|------------|---------|--------------------------|
| **Hot** | Currently in viewport | Never evict |
| **Warm** | Recently viewed or preloaded | Keep bytecode, may evict results |
| **Cold** | Not recently viewed | Evict bytecode + results |

During scrolling, the PageManager:
1. **Detects scroll direction** from viewport movement
2. **Preloads** next 1-2 pages in the scroll direction (dispatches background compilation)
3. **Evicts** bytecode from cold pages to bound memory

---

## 7. Async Resolution System

Some expressions depend on external data (currency exchange rates, API data). Solve handles this with a three-phase async resolution system:

### 7.1 Phase 1: Preflight

Before VM execution, the engine runs `asyncResolver.preflight()` for each resolved package. If data is needed:

```typescript
// Engine checks each package's asyncResolver
for (const [packageId, resolver] of resolvers) {
  const result = resolver.preflight(tokens, expression);
  if (result.needsAsync) {
    return pendingValue(result.cacheKey); // Return immediately
  }
}
```

### 7.2 Phase 2: Resolution

The `currencyExchangeService.convertAsync()` or `DataQueryService.fetch()` resolves the async value. When it completes, the value is cached in `AsyncResultCache`:

```typescript
AsyncResultCache.set(cacheKey, value);
batcher.add({ queryKey, packageId, signal });
```

### 7.3 Phase 3: Batched Re-evaluation

The `AsyncResolutionBatcher` micro-batches resolutions:

```
Tick 1: USD→GBP resolves  ─┐
Tick 1: USD→EUR resolves  ─┤ All in same microtask queue
Tick 1: USD→JPY resolves  ─┘
                              │
                    queueMicrotask(flush)
                              │
                    ┌─────────▼──────────┐
                    │ Single DAG walk    │
                    │ Find ALL affected  │
                    │ lines across ALL   │
                    │ 3 resolved keys    │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Topological sort   │
                    │ affected lines     │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────┐
              │ ≤50 lines: main thread loop   │
              │ >50 lines: offload to worker  │
              └───────────────────────────────┘
```

Without batching, 3 simultaneous resolutions would trigger 3 separate DAG walks and 3 re-evaluation passes. With batching, it's 1 DAG walk + 1 re-evaluation pass.

### 7.4 Staleness Detection

Every async resolution carries an `AbortSignal`. When the user types a new keystroke:
1. The previous keystroke's `AbortController` is aborted
2. All in-flight async fetches detect `signal.aborted === true`
3. Stale results are discarded before being stored in LineCache

This is the **"One AbortController Per Keystroke"** pattern — prevents stale async data from overwriting fresh synchronous results.

---

## 8. Worker Infrastructure

### 8.1 Worker Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       MAIN THREAD                           │
│                                                              │
│  ┌────────────────────┐  ┌─────────────────────────────┐    │
│  │CompilationWorker   │  │     ExecutionPool            │    │
│  │Manager             │  │                              │    │
│  │                    │  │  Worker-1  Worker-2  Worker-N│   │
│  │ Sends expressions  │  │     │         │         │     │    │
│  │ for background     │  │     └────┬────┘         │     │    │
│  │ compilation        │  │          │              │     │    │
│  └────────┬───────────┘  └──────────┼──────────────┘     │    │
│           │                         │                     │    │
└───────────┼─────────────────────────┼─────────────────────┘    │
            │                         │                          │
    ┌───────▼──────────┐    ┌─────────▼────────────┐            │
    │ compilation      │    │ execution.worker.ts  │            │
    │ .worker.ts       │    │                      │            │
    │                  │    │ • Receives batch of   │            │
    │ • Receives:      │    │   {lineNumber,        │            │
    │   expressions[]  │    │    bytecode}          │            │
    │ • Runs: Lex →    │    │ • Executes each on    │            │
    │   Parse → Compile│    │   fresh VM instance   │            │
    │ • Returns:       │    │ • Returns serialized  │            │
    │   {bytecode,     │    │   results             │            │
    │    reads, writes}│    │                      │            │
    └──────────────────┘    └──────────────────────┘            │
```

### 8.2 Worker Types

| Worker | Purpose | Transferable Data |
|--------|---------|-------------------|
| `compilation.worker.ts` | Background bytecode compilation (Tier 3) | Bytecode (ArrayBuffer) |
| `execution.worker.ts` | Batch VM execution for async re-evaluation | Bytecode (ArrayBuffer) |
| `DataQueryWorker.worker.ts` | Generic async data queries | Custom serialized |
| `eval.worker.ts` | Single-expression VM evaluation | Bytecode (ArrayBuffer) |

### 8.3 Inline Worker Pattern

All workers use `esbuild-plugin-inline-worker` which inlines the worker code as a Blob URL at build time. Each worker exports a factory function:

```typescript
// compilation.worker.ts
export default (() => {
  throw new Error("This module is designed to be used as a Web Worker");
}) as unknown as () => Worker;
```

esbuild transforms this into an inline `new Worker(URL.createObjectURL(new Blob([...])))` call, eliminating the need for separate `.js` worker files.

### 8.4 Compilation Worker Lifecycle

```
ThreeTierEvaluator.evaluate(viewport)
  │
  ├─ Tier 1 + Tier 2 for visible lines (synchronous, main thread)
  │
  └─ dispatchBackgroundCompiles(viewport)
       │
       ├─ Collect invisible dirty lines with no bytecode
       ├─ CompilationWorkerManager.compileBatch(items)
       │    │
       │    └─ Worker: Lex → Parse → Compile for each expression
       │         Returns: { lineId, bytecode, reads, writes, textHash }
       │
       └─ storeResults(results, doc)
            │
            └─ For each result:
                 if doc.isBytecodeValid(lineId, textHash):
                   doc.updateLineCompiled(lineId, ...)
```

**Thread safety guard:** Between dispatch and response, the user may edit the line. `isBytecodeValid()` checks that the line's `textHash` still matches the hash the worker compiled against. If the text changed, the worker's bytecode is discarded.

---

## 9. Obsidian Integration Layer

### 9.1 Plugin Lifecycle

```
Obsidian loads plugin
  │
  ├─ SolvePlugin.onload()
  │   ├─ registerEvents()         → PluginEventBus listeners
  │   ├─ restoreUserSettings()    → Load from data.json
  │   ├─ registerSettings()       → SettingsTab UI
  │   ├─ registerEditorExtensions() → CodeMirror ViewPlugin
  │   ├─ addStatusBarCompanion()  → "Solve 🤔/😴" indicator
  │   └─ registerCommands()       → Evaluate expression, commit results
  │
  └─ SolvePlugin.onunload()
      └─ PluginEventBus.removeAllListeners()
```

### 9.2 CodeMirror ViewPlugin

`MarkdownEditorViewPlugin` implements CodeMirror's `PluginValue` interface:

```
update(update: ViewUpdate)
  ├─ Document switch detected?
  │   └─ Reset EngineProvider, recreate DocumentModel + ThreeTierEvaluator
  │
  ├─ docChanged?
  │   ├─ Abort previous keystroke's AbortController
  │   ├─ Create new AbortController
  │   ├─ Convert CodeMirror changes → LineChange[]
  │   ├─ evaluator.applyTransaction(lineChanges)
  │   └─ evaluator.evaluate(viewport, signal)
  │
  └─ viewportChanged only (scroll)?
      └─ evaluator.setViewport(viewport, signal)  // O(visible) fast path
```

### 9.3 Settings Architecture

```
IPluginSettings (interface)
  ├── engine
  │   ├── explicitMode: boolean
  │   ├── locale: string
  │   ├── validation
  │   │   ├── maxExpressionLength: 2000
  │   │   ├── maxComplexity: 500
  │   │   └── maxNestingDepth: 50
  │   └── vm
  │       ├── maxStackDepth: 200
  │       └── maxInstructions: 50000
  ├── interface (animation, status bar, result position)
  ├── inlineSolve (commit behavior)
  ├── variable (render toggle)
  ├── providers[] (per-provider enable/disable)
  └── results { number, integer, float, percentage, datetime, hex, uom }
```

Settings are stored in Obsidian's `data.json` and merge with `DEFAULT_SETTINGS` on load.

### 9.4 Event Bus

The `PluginEventBus` is a simple pub/sub system for cross-component communication:

```typescript
// Emit
pluginEventBus.emit(EPluginEvent.StatusBarUpdate, EPluginStatus.Solving);

// Listen
pluginEventBus.on(EPluginEvent.StatusBarUpdate, (status) => { ... });
```

Events include: `SolveEngineReady`, `StatusBarUpdate`, `WriteResultToActiveDocumentLine`.

---

## 10. Performance Architecture

### 10.1 Caching Strategy

| Cache | Scope | Invalidation |
|-------|-------|-------------|
| **LineCache** (bytecode + result) | Per line, keyed by lineId | Text hash mismatch → clears entry |
| **AsyncResultCache** (resolved data) | Per domain + key | TTL + cache-busting on clear |
| **VMCheckpointer** (VM snapshots) | Per variable-def line | Cleared on structural edit or dirty line before viewport |
| **DependencyGraph** (reads/writes) | Per line, variable-keyed | Cleared on structural edit, rebuilt during evaluate() |
| **SolveHighlightProvider cache** | Per line text | Invalidated on docChanged |
| **PageManager** (temperature tracking) | Per page (~50 lines) | LRU eviction on memory pressure |
| **Position cache** (lineId → position) | Lazy, rebuilt after structural edit | Invalidated on any structural change |

### 10.2 Key Optimizations

1. **SegmentTree (Order-Statistic Treap):** O(log N) line insertions, deletions, and lookups. Replaces O(N) array splicing.

2. **djb2 Text Hashing:** O(1) change detection. Compare hashes instead of strings.

3. **TypedArray Bytecode:** Uint8Array opcodes + Float64Array numbers = zero-copy transfer to workers via `postMessage`.

4. **Numeric Fast Path in VM:** `l.type===Number && r.type===Number` check before dispatching to `binaryOp()` — eliminates function call overhead for >90% of ops.

5. **Value Arena:** During Tier 2 (scroll), `persistentValue()` promotes temporary Values to a permanent area, avoiding per-line allocation.

6. **Pratt Parser Tier-1 Fast Path:** Hardcoded binding power table for `+`, `-`, `*`, `/`, `^`, `%` — skips registry hash-map lookup.

7. **Microtask Batching:** `queueMicrotask()` collapses N async resolutions into 1 DAG walk + 1 re-execution pass.

8. **Execution Pool Threshold:** Offloads re-execution to workers when affected line count > 50 (configurable).

### 10.3 Performance Budgets

| Metric | Budget | Measurement |
|--------|--------|-------------|
| Lexer throughput | <1ms for 1000 tokens | `lexerBenchmarks.spec.ts` |
| Parser throughput | <2ms for 500 token expression | `parserBenchmarks.spec.ts` |
| VM execution | <0.1ms per simple expression | `vmBenchmarks.spec.ts` |
| Full pipeline (Tier 1) | <2ms per expression | `pipelineBenchmarks.spec.ts` |
| Tier 2 (cached) | <0.1ms per expression | `pipelineBenchmarks.spec.ts` |
| Scroll viewport eval | <1ms for 30-line viewport | `fullPipelineThroughputBenchmarks.spec.ts` |
| Memory per 1000 lines | <5MB | Manual measurement |

---

## 11. Build, Test & Release Pipeline

### 11.1 Build Configuration

| Tool | Purpose | Config File |
|------|---------|-------------|
| **esbuild** | Bundle plugin for Obsidian | `esbuild.config.mjs` |
| **TypeScript** | Type checking | `tsconfig.json` |
| **Jest** | Unit + integration testing | `jest.config.js` |
| **ESLint** | Code quality | `.eslintrc` |
| **Prettier** | Formatting | `.prettierrc.json` |

**esbuild plugins:**
- `esbuild-plugin-inline-worker` — Inlines Web Workers as Blob URLs
- `esbuild-sass-plugin` / `esbuild-css-modules-plugin` — CSS processing

**Build command:** `npm run build` (runs `node esbuild.config.mjs production`)

### 11.2 Test Infrastructure

```
86 test suites, 2095+ tests
├── engine/           # 15+ suites: BODMAS, pipeline, document model, segment tree, etc.
├── vm/               # VM opcodes, Value types, checkpoints, conversion
├── benchmarks/       # Lexer/parser/VM/pipeline throughput benchmarks
├── codemirror/       # Editor view plugin, highlight provider
├── providers/        # Per-provider parselet tests
├── format/           # Format engine, fuzz tests
├── bugs/             # Regression tests (Issue71 through Issue82)
└── user_scenario.spec.ts  # End-to-end user scenarios
```

**Running tests:**
```bash
npm test                    # All tests
npx jest <pattern>          # Specific test suite
npx jest --no-coverage      # Skip coverage (faster)
```

### 11.3 Release Process

1. **Version bump:** `node version-bump.mjs` updates `manifest.json`, `package.json`, `versions.json`
2. **Build:** `npm run build` produces `main.js` and `styles.css`
3. **GitHub Actions:** `.github/workflows/release.yml` triggers on tag push, creates GitHub Release with built assets
4. **Obsidian Community Plugin:** Release is published to the Obsidian plugin registry

---

## 12. Contributing Guide

### 12.1 Where to Start

| Task | Files to Read | Complexity |
|------|--------------|------------|
| Add a built-in function | `VMBuiltins.ts`, `FunctionParselet.ts` | Low |
| Add a new token type | `ExpressionLexer.ts`, `OpCode.ts` | Medium |
| Add a new provider package | `builtins.ts`, parselet files | Medium |
| Add a new Value type | `Value.ts`, `VM.ts`, `VMConversion.ts` | High |
| Modify the parser | `PrecedenceParser.ts`, `BindingPower.ts` | High |
| Modify the evaluation strategy | `ThreeTierEvaluator.ts`, `DocumentModel.ts` | High |
| Add a new worker | `workers/*.ts`, `esbuild.config.mjs` | Medium |

### 12.2 Coding Standards

Follow the conventions in `CODING_STANDARDS.md`:
- **No `any` types** — use specific types or `unknown`
- **Prefer `str_replace` over `write_file`** for targeted edits
- **Mimic existing style** — naming, formatting, patterns
- **Reuse existing helpers** — check `utilities/` before writing new ones
- **Inline numeric fast paths** in hot code (VM switch cases)
- **Prefixed comments** for clarity: `// ── Section ──`, `// FIX #n:`, `// Phase X.Y:`

### 12.3 Key Design Patterns

1. **Singleton Registries:** `sharedParseletRegistry`, `sharedOpRegistry`, `sharedLexer`, `sharedVariableResolver` — all providers register into shared singletons.

2. **Discriminated Unions:** `EvalResult = { type: 'value' } | { type: 'pending' }` — no throwing for async, no `null` checks for missing data.

3. **Prototypal Snapshots:** `VMCheckpointer` uses `Object.create(prevSnapshot)` for O(1) cloning with O(depth) lookup.

4. **AbortController Propagation:** `Signal` flows from `MarkdownEditorViewPlugin` → `ThreeTierEvaluator` → `ExpressionEngine` → `executeBytecode` → `resolveAsync`. Every async boundary checks `signal.aborted`.

5. **Transferable Bytecode:** `TypedArray.buffer` is transferred (not copied) to workers via `postMessage`, achieving zero-copy data sharing.

### 12.4 Common Pitfalls

- **Don't** store line numbers as keys — use `lineId` (persistent across structural edits)
- **Don't** forget to call `disableValueArena()` in `finally` blocks — arena leak contaminates subsequent evaluations
- **Don't** modify `DocumentModel.lines` directly — always go through `applyChanges()` or `editLine()`
- **Don't** add `@deprecated` tags to methods that still have legitimate callers
- **Do** wrap worker dispatch in try-catch — workers are optional, fallback to main thread
- **Do** check `signal.aborted` before storing async results

### 12.5 Architecture Decision Records

Key decisions documented in `plans/`:

| Document | Decision |
|----------|----------|
| `MASTER_PLAN.md` | Overall architecture and phased rollout |
| `PLAN_01_consolidate_caches.md` | Single LineCache instead of multiple fragmented caches |
| `PLAN_02_fix_dependency_graph.md` | Bidirectional DAG for variable dependency tracking |
| `PLAN_05_performance_caching_optimization.md` | Three-tier evaluation + SegmentTree + PageManager |
| `PLAN_06_plugin_system_integration.md` | ISolvePackage system for provider registration |
| `ANALYSIS_GAPS_IMPROVEMENTS.md` | Gap analysis and improvement recommendations |

---

## Appendix A: Expression Examples

```
Expression              Pipeline Stages                    Result
──────────────────────────────────────────────────────────────────
2 + 3 * 4               NUMBER(2) PLUS NUMBER(3)           14
                        STAR NUMBER(4)
                        → ADD, MUL opcodes

10% of 200              NUMBER(10) PERCENT OF NUMBER(200)  20
                        → TO_PERCENTAGE, MUL

today + 20 days         NOW PLUS NUMBER(20) UNIT(days)     2026-06-20
                        → DATE_NOW, DATE_ADD

100 USD in GBP          NUMBER(100) UNIT(USD) IN UNIT(GBP) £78.50
                        → UOM_CONVERT_IN (async if rate not cached)

vec3(1, 2, 3) * 2       VEC3 NUMBER(1,2,3) STAR NUMBER(2) vec3(2, 4, 6)
                        → ARR_NEW(3), ARR_SCALE

roll(1, 100)            ROLL NUMBER(1) NUMBER(100)         42
                        → CALL_BUILTIN(37)

:x = 10 + 5             COLON IDENT(x) = NUMBER(10)        15
x + 20                  PLUS NUMBER(5)
                        → STORE_VAR(x), then ADD
                        IDENT(x) PLUS NUMBER(20)
                        → LOAD_VAR(x), ADD → 35
```

## Appendix B: OpCode Map

```
Stack      0-3    NOP, HALT, SWAP, DUP
Literal   10-15   PUSH_NUMBER, PUSH_BIGINT, PUSH_HEX, PUSH_STRING, PUSH_BOOLEAN
Arith     20-27   ADD, SUB, MUL, DIV, MOD, EXP, NEG, POS
Bitwise   30-36   LSHIFT, RSHIFT, BIT_AND, BIT_OR, BIT_XOR, BIT_NOT
Compare   40-45   EQ, NEQ, LT, LTE, GT, GTE
Function  50-52   CALL_PLUGIN, CALL_BUILTIN, RETURN
Variable  60-61   LOAD_VAR, STORE_VAR
Convert   70-74   TO_NUMBER, TO_HEX, TO_PERCENTAGE
UoM       80-84   UOM_CONVERT, UOM_CONVERT_TO, UOM_GET_VALUE, UOM_BEST, UOM_CONVERT_IN
Datetime  90-92   DATE_NOW, DATE_ADD, DATE_SUB
Array    100-108  ARR_NEW, ARR_ADD, ARR_SUB, ARR_DOT, ARR_CROSS, ARR_SCALE,
                  ARR_MAGNITUDE, ARR_NORMALIZE
Plugin   200+      PLUGIN_CUSTOM, extensible range
```

## Appendix C: Dependency Graph

```
📄 Document
├── Line 1: :tax = 10%                  writes=[tax]
├── Line 2: :price = 100                writes=[price]
├── Line 3: price * tax                 reads=[price, tax]
├── Line 4: :total = price + tax*price  reads=[price, tax], writes=[total]
└── Line 5: total / 2                   reads=[total]

DAG:
  price ──→ Line 3, Line 4
  tax   ──→ Line 3, Line 4
  total ──→ Line 5

When price changes (Line 2):
  → DAG.getAffectedLines('price') → [3, 4]
  → Also transitive: Line 4 changes total → getAffectedLines('total') → [5]
  → Re-evaluate in order: Line 3, Line 4, Line 5
```
