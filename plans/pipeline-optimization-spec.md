# Pipeline Optimization & Architecture Spec

> **Created:** 2026-05-30 | **Status:** 📋 Spec — Awaiting Implementation
> **Dependencies:** PLAN_06 (Plugin System Integration)
> **Target:** Hybrid precedence climbing parser + 5-layer pipeline, all < 1ms

---

## Executive Summary

This spec defines the optimization architecture for the solve-js multi-step pipeline. The goal is to implement PLAN_06's 5-layer design (Lexer → Normalizer → Parser → Semantic Resolver → Plugin Resolvers) while maintaining sub-millisecond latency for ALL layers. It also replaces the core parser with a hybrid precedence climbing architecture — inline switch dispatch for built-in operators, parselet registry fallback for plugins — maximizing both pluggability and performance.

**MVP is the full 5-layer pipeline working end-to-end with one real plugin (e.g., mini OSRS domain with async price resolution).** The VM supports Array + Object structured data types — plugins can return rich objects with typed fields instead of just coerced numbers. The generic Array type enables N-dimensional vector math (dot product, cross product, magnitude, normalize, scalar multiply) on vectors of any size, not just Vec2/3/4.

**Key research insight:** Algorithm choice (Pratt vs precedence climbing) matters less than the dispatch mechanism. The winning strategy is: inline switch for built-ins + Map registry for plugins + zero-allocation hot path.

**Design philosophy on async:** The VM is synchronous — async is at the scheduler level. The orchestrator pre-resolves domain values before VM execution. In the future, the DAG + VMCheckpoint infrastructure enables lazy async execution where independent lines evaluate while blocked lines await resolution (see §2.3).

**Opcode numbering:** `DICE_ROLL` (previously opcode 110) is migrated to `CALL_BUILTIN`, giving clean contiguous numbering: ARR_* at 100–108, OBJ_* at 109–113, ARR_MAG/NORM at 114–115. See §6.3.

**Function call opcodes:** `CALL = 50` (currently dead) is repurposed as `CALL_PLUGIN` for plugin-registered functions. `CALL_BUILTIN = 51` remains for sync built-ins (`sqrt`, `sin`, `diceRoll`, `matmul`). The scheduler pre-scans bytecode for `CALL_PLUGIN` to determine whether async DAG analysis is needed — `CALL_BUILTIN` calls are transparent. See §6.6.

---

## 1. Research Summary & Parser Decision

### 1.1 Research Findings

| Source | Finding |
|--------|---------|
| Web research (2026) | Pratt and precedence climbing are algorithmically equivalent. Performance difference is in dispatch, not algorithm. |
| Web research (2026) | V8 optimizes switch/inline dispatch far better than Map-based dispatch due to inline caching and branch prediction. |
| Web research (2026) | Object allocation in the inner loop is the #1 performance killer — not parser choice. |
| User research (Perplexity) | Recommended: precedence climbing core + typed dispatch + intent routing + optional PEG extension points |
| User research (Perplexity) | Biggest wins: no per-keystroke full reparse, no dynamic plugin lookup in inner loop, no AST for trivial cases, no async in critical path |

### 1.2 Parser Decision: Hybrid Precedence Climbing + Parselet Registry

**Not a binary choice.** The optimal architecture is a **two-tier parser**:

```
┌──────────────────────────────────────────────────────────────┐
│  Tier 1: Built-in Fast Path (precedence climbing)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Inline switch on token typeId                        │   │
│  │ - Number, Ident, Paren, Plus, Minus, Star, Slash...  │   │
│  │ - Hardcoded binding powers                           │   │
│  │ - Zero registry lookup                               │   │
│  │ - Zero parselet function call overhead               │   │
│  │ - Direct BytecodeBuilder emissions                   │   │
│  │ → Handles ~95% of expression tokens                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │                                    │
│         ┌───────────────┴───────────────┐                    │
│         │ Token type NOT in built-in set│                    │
│         └───────────────┬───────────────┘                    │
│                         ▼                                    │
│  Tier 2: Plugin Extension Path (parselet registry)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Map.get(prefixTokenTypeId) or Map.get(infixTokenTypeId)│  │
│  │ - Plugin parselets (PrefixParselet, InfixParselet)   │   │
│  │ - Full flexibility for custom syntax                 │   │
│  │ - Only invoked for tokens not in Tier 1              │   │
│  │ → Handles ~5% of expression tokens                   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Why this wins:**
- Built-in operators (+, -, *, /, ^, %, etc.) follow the fast path — no Map lookup, no function call overhead
- Plugin extensibility is preserved — the parselet registry still works for custom tokens
- The fast path is a single switch statement that V8's JIT optimizes heavily
- No existing parselet code is broken — the registry still exists, it's just only called for non-built-in tokens

### 1.3 What Happens to Existing Parser Code

| Component | Fate | Reason |
|-----------|------|--------|
| `Parser.ts` (Pratt) | **Replaced** | New `PrecedenceParser.ts` with hybrid dispatch |
| `ParseletRegistry` | **Preserved** | Still used by Tier 2 plugin path |
| `RecursiveDescentParser` | **Dropped** | Redundant with new architecture; precedence climbing handles everything RD did |
| `BytecodeBuilder` | **Preserved** | Both tiers emit to the same builder |
| All existing parselets | **Preserved** | Continue working through registry in Tier 2 |
| `ISolvePackage` / `registerPackage()` | **Preserved** | Unchanged API |
| `ValueType.Vector2/3/4` enum values | **Collapsed** into `ValueType.Array` | Single Array type for any-length vectors + nested arrays. Vec2/Vec3/Vec4 become length-constrained arrays validated at parse time. |
| `OpCode.VEC_ADD/VEC_SUB/VEC_NEW` etc. | **Renamed** to `ARR_ADD/ARR_SUB/ARR_NEW` | Same implementation, wider type check (`ValueType.Array` instead of `Vector2|3|4`). Marginally faster — 2 type comparisons vs 6. Single composite opcode, not per-element primitives. |
| `OpCode.VEC_DOT/VEC_CROSS/VEC_SCALE` | **Implemented** as `ARR_DOT/ARR_CROSS/ARR_SCALE` | Currently defined in enum but never implemented in the VM switch (dead opcodes). Now implemented with generic Array support — `ARR_DOT` works on any N dimensions, `ARR_CROSS` requires length 3, `ARR_SCALE` scales any-length array. |
| `OpCode.ARR_MAG/ARR_NORM` (new) | **Added** | Magnitude (Euclidean norm) and normalize (unit vector) for any-length arrays. `ARR_MAG` (114) computes `√(∑v[i]²)` as a single composite opcode. `ARR_NORM` (115) returns `v / |v|` — zero-division returns zero-vector. Complements `ARR_DOT`/`ARR_CROSS`/`ARR_SCALE` for a complete N-dimensional vector math surface. |
| `OpCode.DICE_ROLL` (110) | **Removed → CALL_BUILTIN** | Dice rolling is a pure function (2 numbers in, 1 out). Migrated to `CALL_BUILTIN` function. This frees slot 110 for clean opcode numbering: OBJ_NEW=109, OBJ_GET=110, OBJ_SET=111, OBJ_HAS=112, OBJ_KEYS=113, ARR_MAG=114, ARR_NORM=115. |
| `OpCode.CALL` (50) | **Repurposed → CALL_PLUGIN** | Currently dead opcode (defined in enum, no VM handler). Repurposed as `CALL_PLUGIN` for plugin-registered functions — the VM dispatches through a plugin function registry. The scheduler detects `CALL_PLUGIN` in bytecode to determine whether async/DAG analysis is needed. |
| `OpCode.CALL_BUILTIN` (51) | **Preserved, scope expanded** | Remains for sync built-in functions. Scope expands to include `diceRoll`, `matmul`, `transpose` — any pure function with standard Value I/O. |
| `OpCode.RETURN` (52) | **Preserved (dead)** | Reserved for future user-defined functions. No VM handler yet. |
| `PLUGIN_CUSTOM` (OpCode 200) | **Preserved** | Remains as escape hatch for truly custom VM operations that cannot be composed from standard opcodes + COERCE + CALL_BUILTIN. Plugins SHOULD use standard opcodes when possible. |
| `ValueType.Object` (new) | **Added** | Immutable key-value store. `Record<string, Value>`. Plugin resolvers return objects instead of coerced numbers. Full JS-like syntax: literals `{key: val}`, dot access `obj.prop`, bracket access `obj["key"]`. |
| `OpCode.OBJ_NEW/GET/SET/HAS/KEYS` (new) | **Added** | Object crud via standard opcodes (109–113). No PLUGIN_CUSTOM needed for object operations. |

---

## 2. Optimized 5-Layer Pipeline Architecture

### 2.1 Full Pipeline

```
Input: "Iron Axe + Dragon Hide in gp"

┌──────────────────────────────────────────────────────────────┐
│ Layer 1: Lexer (current ExpressionLexer, optimized)          │
│ Budget: < 5µs for typical expression                         │
│                                                              │
│ .scanDocument() — single-pass char walk                      │
│ .resetExpression() — skip classifyLine overhead              │
│ CHAR_CLASS jump table → switch on small ints                 │
│ Monomorphic LexerToken (stable HiddenClass)                  │
│ Pre-merged keywordMap + unitMap (single lookup, not 2-4)     │
│ → [IDENT("Iron"), IDENT("Axe"), PLUS, IDENT("Dragon"),      │
│    IDENT("Hide"), IN, IDENT("gp")]                           │
└───────────────────────┬──────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 2: Phrase Normalizer (new, post-lex pass)              │
│ Budget: < 10µs, O(1) bypass when no vocabs registered        │
│                                                              │
│ if (!this.hasVocabs) return tokens;  // ⚡ 1-cycle bypass    │
│ Trie-based longest-match merging                             │
│ Configurable: plugin chooses in-lex (keywords) or post-lex   │
│   (vocabulary). Engine picks optimal path per-plugin.        │
│ → [PHRASE("Iron Axe"), PLUS, PHRASE("Dragon Hide"),          │
│    IN, UNIT("gp")]                                           │
└───────────────────────┬──────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Hybrid Parser (new PrecedenceParser)                │
│ Budget: < 10µs warm (bytecode cached), < 200µs cold          │
│                                                              │
│ Tier 1 (inline): PHRASE → NUMBER (resolved), PLUS → ADD,    │
│   IN → IN_OP, UNIT → UNIT_REF                               │
│ Tier 2 (registry): only for tokens not in Tier 1 switch      │
│ Emits BytecodeProgram directly (no AST intermediate)         │
│ Incremental: re-parse changed suffix only, cache prefix      │
│ → BytecodeProgram { opcodes, numbers, strings }              │
└───────────────────────┬──────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 3.5: Semantic Resolver (new, pre-VM)                   │
│ Budget: < 5µs (pre-compiled into opcodes by DomainRegistry)  │
│                                                              │
│ NOT a separate pass — coercions are pre-compiled into        │
│ bytecode by DomainRegistry at registration time.             │
│                                                              │
│ DomainRegistry.register(domain) compiles:                    │
│   operator: { op: '+', lhs: 'item', rhs: 'item',             │
│     returns: 'number', coerceLhs: 'number' }                 │
│   → emit: COERCE item→number, COERCE item→number, ADD        │
│                                                              │
│ Type dispatch: Value.typeId ≥ 100 → custom type switch       │
│ (only activates when custom values are on the VM stack)      │
└───────────────────────┬──────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: VM Execution (Array unification)                    │
│ Budget: < 1µs per opcode (warm)                              │
│                                                              │
│ Universal Array type replaces Vec2/3/4:                      │
│   - ValueType.Array stores number[] — any length, nested OK  │
│   - ARR_ADD/ARR_SUB/ARR_NEW/ARR_INDEX/ARR_SLICE opcodes     │
│   - Single type check replaces 3 enum comparisons            │
│   - PLUGIN_CUSTOM preserved as escape hatch (≥200)           │
│ Immutable Object type for structured data:                   │
│   - ValueType.Object stores Record<string, Value>             │
│   - OBJ_NEW/OBJ_GET/OBJ_SET/OBJ_HAS/OBJ_KEYS opcodes        │
│   - Plugin resolvers return objects, not just numbers        │
│   - Full JS-like syntax: {key: val}, obj.prop, obj["key"]    │
│ Custom type dispatch: switch case for typeId ≥ 100           │
│   - Coercion opcodes: COERCE(fromId, toId) — pre-compiled    │
│   - No Map.get() in hot loop — all lookup is pre-compiled    │
│ Stack-based, instruction limit, stack depth limit            │
│ → Value { type: Array, value: [8000, 12000] }                │
│ → Value { type: Object, value: { name: "Iron Axe", ... } }   │
└───────────────────────┬──────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Orchestrator (new, wraps engine)                    │
│ Budget: < 20µs overhead, bypassed for non-plugin expressions │
│                                                              │
│ Fast-path detect: scan ALL tokens (two-phase) → if no domain │
│   indicators, delegate to engine.evaluateLineWithPreTokenized()│
│                                                              │
│ For plugin expressions:                                      │
│   1. Collect unresolved PHRASE identifiers from token stream │
│   2. Batch-resolve via ResolverRegistry (async, 5s timeout)  │
│   3. Substitute resolved values into expression              │
│   4. Re-evaluate with engine (synchronous)                   │
│                                                              │
│ Cache: expression→resolvedValues map with epoch invalidation │
│   (cleared on plugin register/unregister)                    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Fast-Path vs Plugin-Path Decision

**Critical design constraint:** A single-token peek is insufficient. Domain expressions often start with numbers: `5 in gp`, `100 USD to EUR`, `42 + Iron Axe`. These have `NUMBER` as the first token but require orchestration. The fast-path gate must scan **all tokens** for domain indicators.

**Strategy: Two-phase token scan**

```
Every expression enters through the orchestrator:

orchestrator.evaluate(input)
  │
  ├─ Phase 1: Quick lex (tokenizeAll, ~3µs)
  │
  ├─ Phase 2: Scan ALL tokens for domain indicators
  │     - PHRASE token? → full path
  │     - Custom UNIT (not in built-in knownUnits)? → full path
  │     - Domain keyword in any position? → full path
  │     - Domain infix operator (in, of, per) preceded/followed by domain tokens? → full path
  │
  ├─ NO domain indicators found → engine.evaluateExpression(input)
  │     (synchronous fast path, no orchestration overhead)
  │     Budget: < 8µs warm (lex + scan + delegate)
  │
  └─ Domain indicators found → Full orchestration pipeline
        (normalize → parse → resolve async → substitute → evaluate)
        Budget: < 50µs synchronous portion, async portion excluded
```

**Why full tokenizeAll() + scan is acceptable for fast-path gate:**
- Tokenization of simple arithmetic (`1 + 2`) is ~3µs (current baseline: 2.8µs)
- Scanning tokens for domain types is O(n) where n = token count (typically < 10)
- The tokens are re-used by the parser (no double-lexing)
- The alternative (single-token peek) produces false negatives for `5 in gp`

**Key design principle:** The orchestrator is always the entry point, but it detects non-plugin expressions by scanning tokens and delegates directly. There is only ONE code path into the engine, avoiding dual-codepath maintenance burden.

### 2.3 Future: Async-Aware DAG Scheduling (Deferred)

Beyond the orchestrator's pre-resolve model, the DAG + VMCheckpoint infrastructure naturally supports **async VM checkpoints** — lazy execution where the engine continues evaluating independent lines while async domain values resolve.

**How it works:**

1. When the engine encounters a line with unresolved domain values (e.g., `x = Iron Axe in gp`), it fires the async fetch, records the VM state from the last successfully evaluated line (via `VMCheckpointer.snapshot()` on the previous line's execution), and marks the current line as `blocked`
2. The DAG already knows which lines depend on `x` — they stay blocked until `x` resolves
3. Independent lines (`y = 1 + 2`) continue evaluating synchronously — the user sees results immediately
4. When `Iron Axe` resolves, the scheduler restores the VM from the checkpoint and resumes evaluation
5. All downstream lines that were blocked on `x` now become ready and evaluate in dependency order

**Key design principle:** Async is at the scheduler level, NOT inside the VM's hot loop. The VM stays synchronous per-line, preserving its sub-µs JIT-optimized switch. The DAG is the scheduler — `getAffectedLinesInOrder()` already returns topological order; adding a `status: 'ready' | 'blocked'` field per line is the main change.

**Why deferred:** Requires an `AsyncScheduler` that extends `ThreeTierEvaluator` with readiness tracking per line, async resolution callbacks that trigger DAG recomputation, and error handling for timed-out resolutions. The orchestrator pre-resolve model (§5) handles the common case (0-5 domain expressions per document) and is simpler to implement first.

---

## 3. Parser: Hybrid Precedence Climbing Design

### 3.1 Core Algorithm

```typescript
// src/solve-js/src/parser/PrecedenceParser.ts

export class PrecedenceParser {
  private tokens: Token[] = [];
  private current: number = 0;
  private builder: BytecodeBuilder;

  // ── Built-in operator binding powers ──────────────────────────
  // Pre-computed lookup table (Uint8Array) — no Map.get() in hot path.
  // Index = tokenTypeId, value = bindingPower * 2 (to fit in Uint8).
  // 0 = not a built-in infix operator → fall through to Tier 2 registry.
  private static readonly BP_TABLE: Uint8Array = buildBindingPowerTable();

  parseExpression(minBp: number = 0): void {
    // ── Prefix ──────────────────────────────────────────────────
    const token = this.consume();
    this.parsePrefix(token);

    // ── Infix loop (precedence climbing) ────────────────────────
    let lookahead = this.peek();
    while (lookahead) {
      const bp = PrecedenceParser.BP_TABLE[lookahead.typeId];
      if (bp > 0) {
        // ⚡ Fast path: built-in infix operator
        if (bp <= minBp) break;
        this.consume(); // advance past operator
        this.builder.emitInfixOp(lookahead.typeId);
        this.parseExpression(bp); // right operand
      } else {
        // 🐌 Plugin path: check parselet registry
        const parselet = this.registry.getInfix(lookahead.typeId);
        if (!parselet) break;
        if (parselet.bindingPower <= minBp) break;
        this.consume();
        parselet.parse(this, token, lookahead, this.builder);
      }
      lookahead = this.peek();
    }
  }

  private parsePrefix(token: Token): void {
    switch (token.typeId) {
      // ⚡ Built-in prefix tokens — inline, zero lookup
      case NUMBER_ID:  this.builder.emitPushNumber(token); break;
      case IDENT_ID:   this.builder.emitPushIdent(token); break;
      case LPAREN_ID:  this.parseGroup(); break;
      case MINUS_ID:   this.parseUnaryMinus(); break;
      case PLUS_ID:    this.parseExpression(BP_UNARY); break; // unary +
      // ... all other built-ins ...

      // 🐌 Plugin prefix parselet
      default: {
        const parselet = this.registry.getPrefix(token.typeId);
        if (parselet) {
          parselet.parse(this, token, this.builder);
        } else {
          throw ErrorFactory.parsing("NO_PREFIX_PARSELET", ...);
        }
      }
    }
  }
}
```

### 3.2 Incremental Re-Parse Strategy

Instead of re-parsing the entire expression on every keystroke (or relying purely on the bytecode cache), the parser supports **suffix-only re-parse**:

```
Original:  "Iron Axe + Dragon Hide in gp"
Tokens:    [PHRASE, PLUS, PHRASE, IN, UNIT]

User types: "Iron Axe + Dragon Hide + Rune Scimitar in gp"
Tokens:    [PHRASE, PLUS, PHRASE, PLUS, PHRASE, IN, UNIT]
                                   ^ changed suffix starts here

Strategy:
1. Find first token position where token stream diverges (token index 3)
2. Keep cached prefix AST nodes for tokens [0, 1, 2]  → "Iron Axe + Dragon Hide"
3. Re-parse only tokens [3, 4, 5, 6] → "+ Rune Scimitar in gp"
4. Merge prefix result with re-parsed suffix result
```

```typescript
interface CachedPrefix {
  /** Tokens that haven't changed */
  tokens: Token[];
  /** Bytecode emitted for the prefix (before the changed suffix) */
  prefixBytecode: BytecodeProgram;
  /** Expression hash at time of caching */
  expressionHash: number;
}

class IncrementalParser {
  private prefixCache: Map<number, CachedPrefix> = new Map(); // lineNumber → cache

  reParseSuffix(lineNumber: number, newTokens: Token[], previousTokens: Token[]): BytecodeProgram {
    // 1. Find divergence point
    let divergenceIndex = 0;
    const minLen = Math.min(newTokens.length, previousTokens.length);
    while (divergenceIndex < minLen &&
           newTokens[divergenceIndex].typeId === previousTokens[divergenceIndex].typeId &&
           newTokens[divergenceIndex].value === previousTokens[divergenceIndex].value) {
      divergenceIndex++;
    }

    // 2. If no divergence (or first token changed), full re-parse
    if (divergenceIndex === 0 || divergenceIndex === newTokens.length) {
      return this.fullParse(newTokens);
    }

    // 3. Load cached prefix bytecode, re-parse suffix
    const cached = this.prefixCache.get(lineNumber);
    if (cached && cached.tokens.length === divergenceIndex) {
      const builder = this.builderPool.acquire();
      builder.loadPrefix(cached.prefixBytecode); // copy prefix bytecode
      this.parser.loadSuffix(newTokens.slice(divergenceIndex));
      this.parser.parseExpression(0, builder);
      const program = builder.build();
      this.builderPool.release(builder);

      // Update cache
      this.prefixCache.set(lineNumber, {
        tokens: newTokens.slice(0, divergenceIndex),
        prefixBytecode: program, // cache full program for next time
        expressionHash: hashTokens(newTokens),
      });
      return program;
    }

    // 4. Cache miss — full re-parse
    return this.fullParse(newTokens);
  }
}
```

**When incremental re-parse applies:**
- User appends to end of expression: `"1 + 2"` → `"1 + 2 + 3"` — re-parse only `+ 3`
- User edits in middle: `"1 + 2 + 3"` → `"1 + 5 + 3"` — re-parse from `5` onward
- User deletes from end: `"1 + 2 + 3"` → `"1 + 2"` — re-use cached prefix

**When it doesn't:**
- First token changes (expression completely different)
- Plugin register/unregister (bytecode cache cleared)
- Expression hash mismatch (different expression entirely)
- **Any variable referenced in cached prefix changed via DAG** — incremental cache is cleared when `DependencyGraph.registerLine()` detects a variable write that affects cached lines (see §3.3 DAG integration)

### 3.3 Incremental Parse + DAG Integration

**Problem:** Cached prefix bytecode may reference variables that changed via the dependency graph, producing stale results.

**Solution:** The incremental parser is DAG-aware. When a variable is written (via `DependencyGraph.registerLine()` with a `writes` entry), all incremental prefix caches for lines that `read` that variable are invalidated.

```typescript
class IncrementalParser {
  private dag: DependencyGraph;

  /**
   * Called by ExpressionEngine when a variable is written.
   * Clears prefix caches for all lines that read the changed variable.
   */
  onVariableWrite(variable: string): void {
    const affectedLines = this.dag.getLinesThatRead(variable);
    for (const lineNumber of affectedLines) {
      this.prefixCache.delete(lineNumber);
    }
  }

  /**
   * Called on plugin register/unregister — full clear.
   */
  onPluginChange(): void {
    this.prefixCache.clear();
  }
}
```

**Invalidation rules:**
| Event | Action |
|-------|--------|
| Variable written (via DAG) | Clear prefix caches for all dependent lines |
| Plugin register/unregister | Full clear (all caches: bytecode, resolution, incremental) |
| Line deleted / reordered | Cache miss → full re-parse, then re-cache |
| Expression unchanged on re-eval | Cache hit → reuse prefix, re-parse suffix only |

---

## 4. Phrase Normalizer Optimization

### 4.1 Configurable Strategy

Each plugin's domain spec can declare where phrase matching happens:

```typescript
interface DomainSpec {
  namespace: string;

  /** Vocabulary entries — can choose strategy per-entry or per-domain */
  vocabulary?: Record<string, {
    type: string;
    /** Where to match: 'lexer' (inline, faster) or 'normalizer' (post-lex, flexible) */
    matchIn?: 'lexer' | 'normalizer';
  }>;

  /** Keywords — always matched in-lexer */
  keywords?: Record<string, string>;

  /** Multi-word phrases — always matched in-lexer via phrase trie */
  phrases?: Record<string, string>;
}
```

**Default rules:**
- Single-word vocabulary entries → in-lexer (merged into keyword map)
- Multi-word vocabulary entries → normalizer (post-lex pass)
- Plugin can override per-entry

### 4.2 Zero-Overhead Bypass

```typescript
class PhraseNormalizer {
  private hasVocabs: boolean = false;

  normalize(tokens: Token[]): Token[] {
    if (!this.hasVocabs) return tokens; // ⚡ 1-cycle guard
    // ... trie-based merging ...
  }
}
```

When no plugins with multi-word vocabulary are registered, `hasVocabs` is `false` and the normalizer is a single branch instruction — effectively zero overhead.

### 4.3 Trie Construction

Share the trie infrastructure with `ExpressionLexer.buildPhraseTrie()`. The normalizer uses the same `PhraseTrieNode` structure but with vocabulary-specific semantics (merging IDENT → PHRASE instead of replacing text → operator type).

---

## 5. Orchestrator Fast-Path Design

### 5.1 Fast-Path Detection (Two-Phase Token Scan)

```typescript
class Orchestrator {
  // Pre-computed set of token typeIds that indicate domain expressions.
  // Built from all registered DomainSpec keywords, vocabulary, and units.
  private domainTokenIds: Set<number> = new Set();
  // Pre-computed set of domain infix keywords (in, of, per) that signal
  // domain arithmetic regardless of surrounding token types.
  private domainInfixIds: Set<number> = new Set();

  private hasAnyDomains: boolean = false;

  async evaluate(input: string): Promise<Value> {
    // ── Fast-path gate (O(n) token scan, but n < 10 for typical expressions) ──
    if (!this.hasAnyDomains) {
      // No domains registered — always fast path, skip lex too
      return this.engine.evaluateExpression(input);
    }

    // Lex once — tokens are re-used by the parser if we take the full path
    const tokens = this.engine.getLexer().resetExpression(input).tokenizeAll();

    // Scan ALL tokens for domain indicators (not just first token — critical
    // for expressions like "5 in gp" where the first token is NUMBER).
    if (!this.hasDomainTokens(tokens)) {
      // ⚡ Pure arithmetic — bypass orchestrator, delegate to engine
      // Pass pre-lexed tokens to engine to avoid double-lexing
      return this.engine.evaluateLineWithPreTokenized(-1, input, tokens);
    }

    // ── Full orchestration path ──────────────────────────────────
    // Tokens already lexed above, no double-lexing
    const normalized = this.normalizer.normalize(tokens);
    // ... (rest of orchestration pipeline) ...
  }

  /**
   * Check if ANY token in the stream indicates a domain expression.
   * O(n) but n is trivial (< 10 tokens for typical expressions).
   *
   * False positives are acceptable (pure expression takes the full path
   * unnecessarily — rare, just a few µs extra).
   * False negatives are NOT acceptable (domain expression misclassified
   * as pure arithmetic — would skip async resolution entirely).
   */
  private hasDomainTokens(tokens: Token[]): boolean {
    for (const token of tokens) {
      // Direct domain token type (PHRASE, custom UNIT, domain keyword)
      if (this.domainTokenIds.has(token.typeId)) return true;

      // Domain infix operator (in, of, per) — domain arithmetic indicator
      if (this.domainInfixIds.has(token.typeId)) return true;
    }
    return false;
  }
}
```

### 5.2 Async Resolution with Timeout

```typescript
async resolveAll(identifiers: string[]): Promise<Map<string, unknown>> {
  const TIMEOUT_MS = 5000;
  const deduped = [...new Set(identifiers)];
  if (deduped.length === 0) return new Map();

  const results = new Map<string, unknown>();

  await Promise.all(
    Array.from(this.resolvers.values()).map(async (resolver) => {
      try {
        const resolved = await Promise.race([
          resolver.resolve(deduped),
          new Promise<Map<string, unknown>>((_, reject) =>
            setTimeout(() => reject(new Error('Resolver timeout')), TIMEOUT_MS)
          ),
        ]);
        for (const [key, value] of resolved) {
          results.set(key, value);
        }
      } catch (err) {
        console.warn(`Resolver "${resolver.name}" failed:`, err);
      }
    })
  );

  return results;
}
```

### 5.3 Expression → Resolved Values Cache

```typescript
class Orchestrator {
  // expression hash → resolved identifier values
  private resolutionCache: Map<number, Map<string, unknown>> = new Map();

  async evaluate(input: string): Promise<Value> {
    // ... fast-path gate ...

    const hash = fastHash(input);

    // Check resolution cache (session-lifetime, cleared on plugin change)
    const cached = this.resolutionCache.get(hash);
    if (cached) {
      const substituted = this.substitute(tokens, cached);
      return this.engine.evaluateLineWithTokens(-1, substituted);
    }

    // Resolve + cache + evaluate
    const resolved = await this.resolverRegistry.resolveAll(unresolved);
    this.resolutionCache.set(hash, resolved);
    // ...
  }

  clearCaches(): void {
    this.resolutionCache.clear();
    this.engine.getBytecodeCache().clear(); // engine's bytecode cache too
  }
}
```

---

## 6. VM Changes (Minimal)

### 6.1 Custom Type Dispatch

The VM's opcode dispatch loop adds one `if` branch for custom types:

```typescript
// VM.ts — minimal addition to existing hot loop
function executeOpcode(vm: VM, opcode: number): void {
  switch (opcode) {
    // ... existing opcodes unchanged ...

    case OpCode.COERCE: {
      const fromId = vm.nextNumber(); // from bytecode number stream
      const toId = vm.nextNumber();
      const value = vm.pop();
      // Pre-compiled coercion: DomainRegistry compiled this at registration
      const rule = CoercionRegistry.getById(fromId, toId)!;
      const result = rule.convert(value, vm);
      vm.push(result);
      break;
    }

    case OpCode.CUSTOM_ADD: {
      const rhs = vm.pop();
      const lhs = vm.pop();
      // Dispatch on typeId ≥ 100 (custom types)
      if (lhs.customType && lhs.customType.id >= 100) {
        vm.push(lhs.customType.dispatchAdd(lhs, rhs, vm));
      } else if (rhs.customType && rhs.customType.id >= 100) {
        vm.push(rhs.customType.dispatchAdd(lhs, rhs, vm));
      } else {
        vm.push(numberValue(lhs.value + rhs.value));
      }
      break;
    }
  }
}
```

**Design principle:** Coercion logic is pre-compiled into opcodes by `DomainRegistry`. The VM doesn't do `Map.get()` lookups at runtime — it reads coercion IDs from the bytecode number stream and dispatches via a pre-populated array.

**Allocation note:** "0 allocations" for the semantic resolver layer refers to **dispatch overhead** — the resolver is not a separate pipeline pass. However, the COERCE opcode's `convert()` function may allocate Value objects at execution time. Those allocations are counted against the VM layer, not the semantic resolver layer.

### 6.2 What Does NOT Change in the VM

- Stack operations (push, pop, peek)
- Instruction limit and stack depth limit
- Existing opcodes (PUSH_NUMBER, ADD, MUL, etc.) — all numeric ops unchanged
- Variable resolution (ScopeManager)
- Dependency graph tracking
- Memo cache / LineCache
- `PLUGIN_CUSTOM` escape hatch — plugins can still register custom opcode handlers for operations that cannot be composed from standard opcodes
- `CALL_BUILTIN` (51) — sync built-in functions remain unchanged in mechanism, scope expanded to include `diceRoll`, `matmul`, `transpose`
- `CALL_PLUGIN` (50, repurposed from dead `CALL` opcode) — new opcode for plugin-registered functions with async support

### 6.3 Array Type Unification (Vec2/3/4 → `ValueType.Array`)

**Current problem:** `ValueType` has three separate enum values for vectors (`Vector2=7`, `Vector3=8`, `Vector4=9`), three separate type checks in `binaryOp()`, and dedicated opcodes (`VEC_ADD`, `VEC_SUB`, `VEC_NEW`, etc.). This is a closed system — plugins cannot define new vector-like types, and nested arrays (`[[1,2],[3,4]]`) are not supported.

**Solution:** Collapse `Vector2`, `Vector3`, `Vector4` into a single `ValueType.Array`. Vectors are just arrays with length constraints enforced at parse time, not at the VM level.

```typescript
// Value.ts — unified Array type
export const enum ValueType {
  Number = 0,
  Hex = 1,
  BigInt = 2,
  String = 3,
  Datetime = 4,
  Percentage = 5,
  Uom = 6,
  Array = 7,       // ← replaces Vector2/3/4. Stores: number[] | Value[][]
  Boolean = 8,      // renumbered from 10 (safe: all code uses enum names, not raw ints)
  Unit = 9,         // renumbered from 11 (safe: all code uses enum names, not raw ints)
  Object = 10,      // ← new. Stores: Readonly<Record<string, Value>>. Immutable.
  // typeIds 11–99 reserved for core types
  // typeIds 100+ reserved for plugin-defined types
}
```

**Value class change:**

The old `isVector()` method (which checked `Vector2|3|4`) is replaced by `isArray()` (which checks `Array`). All callers that previously checked `isVector()` now check `isArray()` — identical semantics, single type check.

```typescript
export class Value {
  public type: ValueType;
  public value: number | bigint | string | boolean | number[] | Value[][] | Readonly<Record<string, Value>>;  // expanded union
  public unit?: string;

  // Replaces the old isVector() method (Vector2|3|4 → Array).
  // All code that previously checked isVector() now checks isArray().
  isArray(): this is Value & { value: number[] } {
    return this.type === ValueType.Array;
  }

  isObject(): this is Value & { value: Readonly<Record<string, Value>> } {
    return this.type === ValueType.Object;
  }

  /** Array length (0 for non-array types). */
  get length(): number {
    return this.type === ValueType.Array ? (this.value as number[]).length : 0;
  }
}

export function arrayValue(v: number[]): Value {
  if (_arena) return _arena.acquire(ValueType.Array, v);
  return new Value(ValueType.Array, v);
}

export function objectValue(props: Record<string, Value>): Value {
  if (_arena) return _arena.acquire(ValueType.Object, Object.freeze({ ...props }));
  return new Value(ValueType.Object, Object.freeze({ ...props }));
}
```

**Immutability:** Objects are `Object.freeze()`'d on creation. `OBJ_SET` copies the existing properties, updates the target key, and freezes the result — a functional update. This preserves DAG determinism: the same object reference always has the same property values. The arena handles the allocation cost of copying. Object size is limited to 64 keys (configurable) to prevent abuse.

**VM dispatch changes — collapsing 3 type checks into 1:**

Before (VMConversion.ts):
```typescript
if ((l.type === ValueType.Vector2 || l.type === ValueType.Vector3 || l.type === ValueType.Vector4) &&
    (r.type === ValueType.Vector2 || r.type === ValueType.Vector3 || r.type === ValueType.Vector4)) {
  // 6 integer comparisons
```

After:
```typescript
if (l.type === ValueType.Array && r.type === ValueType.Array) {
  // 2 integer comparisons — 3× fewer checks in the hot path
  const lv = l.value as number[];
  const rv = r.value as number[];
  const len = Math.min(lv.length, rv.length);
  const result: number[] = [];
  for (let i = 0; i < len; i++) result.push(op(lv[i], rv[i]));
  return arrayValue(result);
}
```

The implementation is **identical** — the same component-wise iteration — but the type check is simpler and the VM supports arrays of any length, not just 2/3/4.

**New Array opcodes:**

| OpCode | Value | Stack Effect | Description |
|--------|:-----:|:------------:|-------------|
| `ARR_NEW` | 105 | `n items → array` | Pop `n` values, create array |
| `ARR_ADD` | 100 | `arr arr → arr` | Component-wise add (same length) |
| `ARR_SUB` | 101 | `arr arr → arr` | Component-wise subtract |
| `ARR_DOT` | 102 | `arr arr → num` | Dot product — works on any N dimensions (not locked to 2/3/4) |
| `ARR_CROSS` | 103 | `arr arr → arr` | Cross product (length must be 3) |
| `ARR_SCALE` | 104 | `arr num → arr` | Scalar multiply — scales any-length array |
| `ARR_INDEX` | 106 | `arr idx → elem` | Read element at index |
| `ARR_SLICE` | 107 | `arr start end → arr` | Extract sub-array |
| `ARR_LEN` | 108 | `arr → num` | Get array length |
| `ARR_MAG` | 114 | `arr → num` | Magnitude (Euclidean norm): `√(∑v[i]²)`. Works on any N dimensions. |
| `ARR_NORM` | 115 | `arr → arr` | Normalize (unit vector): `v / |v|`. Zero-vector returns zero-vector (defensive, exact `mag === 0` check). Near-zero vectors (< 1e-10) use epsilon check for safety. Works on any N dimensions. |

**ARR_INDEX vs ARR_SLICE semantics:**
- `ARR_INDEX` returns a single element (number, or nested Value for sub-arrays). This enables **element-level DAG tracking** — the dependency graph can record which specific index was read.
- `ARR_SLICE` returns a new array containing the range `[start, end)`. This handles matrix row/column extraction and sub-array operations.

**Nested array support:**
```
[[1, 2], [3, 4]]  →  ValueType.Array, value = [arrayValue([1,2]), arrayValue([3,4])]
```

Nested arrays are stored as `Value[][]` inside the outer Value. The `binaryOp` fast path only triggers for `number[]` arrays (both elements are numbers); nested arrays fall through to the generic path (future: matrix operations).

**N-dimensional vector math (generic, any length):**

The generic `ValueType.Array` enables vector math on arrays of **any dimension**, not just the old Vec2/3/4. The complete vector math surface:

| Operation | Syntax | Opcodes | Works on |
|-----------|--------|---------|:--------:|
| Component-wise add | `a + b` | `ARR_ADD` | Any N (same length) |
| Component-wise sub | `a - b` | `ARR_SUB` | Any N (same length) |
| Dot product | `dot(a, b)` | `ARR_DOT` | Any N (same length) |
| Cross product | `cross(a, b)` | `ARR_CROSS` | N=3 only |
| Scalar multiply | `a * 2`, `2 * a` | `ARR_SCALE` | Any N |
| Magnitude (norm) | `mag(a)` | `ARR_MAG` | Any N |
| Normalize | `norm(a)` | `ARR_NORM` | Any N |
| Element access | `a[i]` | `ARR_INDEX` | Any N |
| Sub-array | `a[1..3]` | `ARR_SLICE` | Any N |
| Length | `len(a)` | `ARR_LEN` | Any N |

```
dot([1,2,3], [4,5,6])    // → 32       (1×4 + 2×5 + 3×6)
mag([3, 4])              // → 5        (√(9+16))
norm([3, 4])             // → [0.6, 0.8]  (unit vector)
dot([1,2,3,4,5], [5,4,3,2,1])  // → 35  (5D dot product)
mag([1,1,1,1,1])         // → √5 ≈ 2.236  (5D magnitude)
```

**ARR_MAG / ARR_NORM implementation:** Both are composite opcodes — single VM instructions, NOT decomposed into per-element primitives. `ARR_MAG` computes `√(∑v[i]²)` using `Math.sqrt()` inline in the VM handler. `ARR_NORM` divides each component by the magnitude — exact `mag === 0` check returns zero-vector (defensive, avoids NaN). Near-zero vectors (`mag < 1e-10`) use epsilon for robustness against floating-point underflow.

**ARR_DOT note:** `ARR_DOT` (opcode 102) replaces `VEC_DOT` which was defined in the `OpCode` enum but **never implemented in the VM switch** — it fell through to `default` and was a dead opcode. The new `ARR_DOT` implementation is the first time dot product actually executes in the VM. Same for `ARR_CROSS` and `ARR_SCALE`.

**Composable operations (not dedicated opcodes):** Distance (`mag(a - b)`), angle (`acos(dot(a,b) / (mag(a)*mag(b)))`), and projection (`b * dot(a,b) / dot(b,b)`) are all fully composable from existing ARR_* opcodes — no dedicated opcodes needed.

**Array length limit:** Maximum array length is capped at 1024 elements (configurable via `maxArrayLength`). This prevents O(n) vector math ops (ARR_MAG, ARR_DOT, ARR_NORM) from degrading on pathological inputs while still supporting practical use cases up to high-dimensional vectors.

**Performance:** `ARR_ADD` is a single composite opcode — NOT decomposed into per-element `ARR_INDEX` + `ADD` + `ARR_SET` primitives. This keeps vector addition at 1 opcode instead of ~6, maintaining sub-1µs vector ops. The `ARR_INDEX`/`ARR_SLICE` opcodes exist for element-level access and DAG tracking, but bulk operations use composite opcodes.

**What happens to existing Vector parselets:**

The vector parselet files (`VectorParselet.ts`, `VectorOpParselets.ts`, `FloatParselet.ts`) change their opcode emissions — `VEC_ADD` → `ARR_ADD`, `VEC_NEW` → `ARR_NEW`, etc. The parse logic (component count validation, length mismatch errors) moves from the VM switch into the parselet itself. The VM trusts the parser to emit correct lengths.

**PLUGIN_CUSTOM preserved as escape hatch:**

Plugins SHOULD compose operations from standard opcodes (PUSH, ARR_*, COERCE, CALL) whenever possible — this lets V8 JIT-optimize their bytecode identically to core code. However, `PLUGIN_CUSTOM` (opcode 200) and the `default` switch fallthrough for opcodes ≥ 200 remain for operations that truly cannot be expressed in standard bytecode:

- Custom data structure operations (e.g., a plugin implementing a tree or graph type)
- Hardware-accelerated operations (WebGL, WASM)
- Stateful plugin operations that need access to plugin internals not exposed via the VM

**Decision rule:** Three tiers of operation complexity:
1. **Composable from standard opcodes** (PUSH, ARR_*, OBJ_*, binary, COERCE) → use standard opcodes.
2. **Pure function with standard Value I/O, synchronous** (e.g., `diceRoll(from, to)`, `matmul(A, B)`, `transpose(A)`, `sqrt(x)`) → use `CALL_BUILTIN`. The function body has full access to VM internals but the interface is standard — stack args in, stack result out. The scheduler ignores these — they're transparent to DAG analysis.
2.5. **Plugin-registered operations with standard I/O** (e.g., `fetchPrice("Iron Axe")`, `queryDB("users")`) → use `CALL_PLUGIN`. Like `CALL_BUILTIN` in bytecode shape (fnIndex + argCount), but dispatched through a **plugin function registry** that supports async resolution. The scheduler scans bytecode for `CALL_PLUGIN` to detect lines that need DAG analysis — this is the signal that tells the orchestrator "this line may block on external data."
3. **Fundamentally non-composable** (e.g., `renderToCanvas()`, custom data structures with private state) → use `PLUGIN_CUSTOM`.

This keeps the opcode table lean (16 array/object opcodes total: nine ARR_* at 100–108, five OBJ_* at 109–113, ARR_MAG at 114, ARR_NORM at 115) while `CALL_BUILTIN` and `CALL_PLUGIN` scale to arbitrary functions without opcode bloat.

### 6.4 Element-Level DAG Tracking (Future — Not in MVP)

With the unified `ValueType.Array` and `ARR_INDEX`/`ARR_SLICE` opcodes, the dependency graph can track dependencies at the **element level** instead of the variable level. This is a future optimization (Level C from the Array unification roadmap).

```typescript
// Future: element-level dependency tracking
interface ElementDependency {
  variable: string;       // e.g., "myVec"
  indices: number[];      // e.g., [2] for myVec[2]
  consumerLine: number;
  resultIndices: number[];// which result elements depend on this
}

class ElementDAG {
  // "myVec[2]" → { line 5, resultIdx [2, 7] }  (line 5's result[2] and result[7] depend on myVec[2])
  private elementConsumers: Map<string, Map<number, ElementDependency[]>> = new Map();

  trackElementRead(readVar: string, readIdx: number, lineNumber: number, resultIdx: number): void {
    // ... fine-grained tracking ...
  }

  /** When myVec[2] changes, return ONLY the specific result elements that need recomputation. */
  getAffectedElements(variable: string, changedIndices: number[]): ElementDependency[] {
    // Returns only the result indices that actually depend on the changed element indices.
    // This is the key to spreadsheet-like incremental recomputation.
  }
}
```

**Why deferred:** Element-level DAG requires the incremental parser's prefix cache to track indices, not just tokens. This is a significant complexity increase. The variable-level DAG (current) is sufficient for MVP — plugin domain expressions typically have scalar results, not array results.

### 6.5 Object Type Support (Immutable Key-Value Store)

**Current gap:** The VM has no structured data type. Plugin domain entities (like OSRS items) must be coerced to numbers, losing type information, nested data, and metadata. Objects fill this gap alongside Arrays — together they form the foundation for plugin-defined structured types.

**Solution:** `ValueType.Object` — an immutable `Record<string, Value>` with full JS-like syntax support.

**Object opcodes:**

| OpCode | Value | Stack Effect | Description |
|--------|:-----:|:------------:|-------------|
| `OBJ_NEW` | 109 | `key1 val1 ... keyN valN N → obj` | Pop N key-value pairs (alternating), create frozen object |
| `OBJ_GET` | 110 | `obj key → value` | Read property. Returns `numberValue(0)` if key missing (defensive). |
| `OBJ_SET` | 111 | `obj key val → obj'` | Immutable set: copies all properties, updates key, freezes result. O(n) in key count (capped at 64). |
| `OBJ_HAS` | 112 | `obj key → bool` | Property existence check. |
| `OBJ_KEYS` | 113 | `obj → arr` | Get keys as string array. |

**OBJ_GET performance:** Direct property access on frozen object — V8's inline cache (IC) optimizes repeated `obj.prop` lookups to ~1 cycle after warm-up. No Map lookup for static keys; bracket access uses Map for dynamic keys.

**OBJ_SET performance:** Copies all own-property keys (limited to 64). `Object.freeze()` ensures immutability. Arena bump allocation makes the copy cost amortized near-zero during scroll execution.

**Parser — Full JS-like syntax:**

```typescript
// Object literals
{}                                     // empty object — OBJ_NEW 0
{ name: "Iron Axe", price: 8000, inStock: true }
{ name: "Iron Axe", price: 8000, }  // trailing comma allowed
{ x }                                 // shorthand: { x: x } (when x is a variable)
{ [expr]: val }                       // computed property name — key evaluated at runtime (deferred to Phase 6+)
{ x: 1, y: 2, z: 3 }                 // multi-line OK

// Dot access
obj.property                          // → OBJ_GET(obj, "property")
obj.nested.deep                       // → chained OBJ_GET: OBJ_GET(OBJ_GET(obj, "nested"), "deep")

// Bracket access (dynamic keys)
obj["property"]                        // → OBJ_GET(obj, "property") — static string, compiled to literal
obj[varName]                           // → OBJ_GET(obj, varName) — dynamic, evaluated at runtime
obj[0]                                 // → OBJ_GET(obj, stringValue("0")) — numeric index coerced to string
obj[`prefix_${suffix}`]               // → OBJ_GET(obj, computed) — template literal

// Mixed access
obj.arr[2].prop                        // → OBJ_GET(ARR_INDEX(OBJ_GET(obj, "arr"), 2), "prop")
```

**Compilation strategy:** Static dot access (`obj.prop`) compiles to `OBJ_GET` with the key embedded in the string table — zero runtime string allocation. Dynamic bracket access (`obj[expr]`) evaluates `expr` first, pushes the result, then emits `OBJ_GET`.

**Interaction with plugins:**

```
// Without Objects: plugin entity → coerced to number
"Iron Axe"  →  COERCE item→number  →  8000
// Lost: name, stats, icon, trade limit, etc.

// With Objects: plugin entity → rich structured value
"Iron Axe"  →  { name: "Iron Axe", price: 8000, type: "weapon", stats: { attack: 10, defence: 2 } }
"Iron Axe".price       →  8000        (OBJ_GET)
"Iron Axe".stats.attack →  10         (nested OBJ_GET)
"Iron Axe" + "Dragon Hide"  →  COERCE(item,number) + COERCE(item,number)  →  ADD
```

**Nested structure support:** Objects can contain arrays and other objects — full arbitrary nesting:

```
{ items: [{ name: "Iron Axe", price: 8000 }, { name: "Dragon Hide", price: 12000 }] }
```

This naturally supports plugin domain data: a resolver returns an object with typed fields, and the VM accesses them via standard `OBJ_GET` — no `PLUGIN_CUSTOM` needed.

**DAG integration:** Variable-level tracking for MVP (change to `obj` invalidates all consumers of `obj`). Property-level tracking deferred — like element-level DAG for arrays (§6.4), this requires per-property dependency tracking in the incremental parser.

**Prototype pollution protection (critical):** Frozen objects still inherit `Object.prototype` members (`toString`, `valueOf`, `constructor`, `hasOwnProperty`, etc.). Without explicit guards, `obj.toString` would return a function instead of `numberValue(0)`. Both `OBJ_GET` and `OBJ_HAS` MUST use `Object.prototype.hasOwnProperty.call(obj, key)` to restrict lookups to own properties only:

```typescript
// VM.ts — OBJ_GET handler (correct)
case OpCode.OBJ_GET: {
  const key = vm.pop();
  const obj = vm.pop();
  if (obj.type !== ValueType.Object) throw typeError("OBJ_GET on non-object");
  const record = obj.value as Readonly<Record<string, Value>>;
  const keyStr = String(key.value);  // numeric keys coerced to strings
  if (Object.prototype.hasOwnProperty.call(record, keyStr)) {
    vm.push(record[keyStr]);  // returns existing Value ref — zero allocation
  } else {
    vm.push(numberValue(0));  // defensive fallback for missing keys
  }
  break;
}
```

**Numeric bracket access:** `obj[0]` is supported — numeric indices are coerced to string keys (`"0"`). This aligns with JavaScript semantics and allows array-like object access patterns.

**OBJ_SET type safety:** Calling `OBJ_SET` on a non-object Value throws a type error at the VM level. The parser guarantees correct types for well-formed expressions; this guard catches malformed bytecode.

**OBJ_KEYS return type:** `OBJ_KEYS` returns a `Value` with `ValueType.Array` containing string `Value` elements. Example: `OBJ_KEYS({a: 1, b: 2})` → `arrayValue([stringValue("a"), stringValue("b")])`. This is a new allocation (array Value + N string Values).

**V8 caveat — Object.freeze() and hidden classes:** `Object.freeze()` can push objects into V8's dictionary (slow) mode if the object shape is unpredictable. For optimal inline caching, all objects returned by a given plugin resolver should share the same key set (e.g., every OSRS item has `{name, price, type, stats}`). The spec recommends consistent shapes but does not enforce them at the VM level — the performance degradation (dictionary mode) is a soft penalty, not a correctness issue.

**Safety limits:**
- Max 64 keys per object (configurable via `maxObjectKeys`)
- Max nesting depth 8 levels (shared with Array limit)
- `OBJ_GET` returns `numberValue(0)` for missing keys (defensive, same as `LOAD_VAR` fallback)
- `OBJ_SET` rejects if adding a key would exceed the 64-key limit
- `OBJ_GET`/`OBJ_SET`/`OBJ_HAS` on non-object Value throws type error
- Empty objects (`{}`) are supported — `OBJ_NEW 0` creates `Object.freeze({})`

### 6.6 CALL_PLUGIN vs CALL_BUILTIN — Why Two Function Call Opcodes

**The problem with a single `CALL_BUILTIN`:** Conflating sync math (`sqrt`, `sin`, `diceRoll`) with plugin calls (`fetchPrice`, `queryDB`) means the scheduler can't distinguish "this is fast and deterministic" from "this depends on external plugin resolution and might need DAG analysis." The orchestrator would have to conservatively assume every function call needs async handling — wasting cycles on pure math expressions.

**Solution:** Two opcodes, same bytecode shape, different dispatch:

| OpCode | Value | Purpose | VM Dispatch | Scheduler |
|--------|:-----:|---------|-------------|-----------|
| `CALL_BUILTIN` | 51 | Sync built-in: `sqrt`, `sin`, `diceRoll`, `matmul`, `transpose` | `builtinFunctions[fnIdx]` array lookup → call → push. Sub-µs. | Transparent — ignores these calls. No DAG signal. |
| `CALL_PLUGIN` | 50 | Plugin functions: `fetchPrice("Iron Axe")`, `queryDB("users")` | `pluginFunctionRegistry[fnIdx]` lookup → call → push. May return Promise. | Pre-scans bytecode for `CALL_PLUGIN` → marks line as potentially async → pre-resolves before VM, or blocks line for async checkpoint. |

**Bytecode shape (identical for both):**

```
CALL_BUILTIN fnIdx argCount    // 3 bytes: opcode, fn index, arg count
CALL_PLUGIN  fnIdx argCount    // 3 bytes: opcode, fn index, arg count
```

Both consume `argCount` values from the stack (in reverse order), call the function with `args[]`, and push the result. The difference is WHERE the function lives and HOW the scheduler treats it.

**Plugin Function Registry:**

```typescript
// VMBuiltins.ts — new registry alongside builtinFunctions
export const pluginFunctionRegistry: Record<
  number,
  (args: Value[], vm: VM) => Value | Promise<Value>
> = {};

// DomainRegistry compiles plugin functions into the registry at registration time:
DomainRegistry.register({
  namespace: 'osrs',
  functions: {
    fetchPrice: {
      index: 0,  // assigned sequentially per-domain
      fn: async (args, vm) => {
        const itemName = args[0].value as string;
        const price = await fetchOsrsPrice(itemName);
        return numberValue(price);
      },
    },
  },
});
```

**VM handler (CALL_PLUGIN):**

```typescript
case OpCode.CALL_PLUGIN: {
  const fnIdx = opcodes[ip++];
  const argCount = opcodes[ip++];
  const args: Value[] = [];
  for (let i = 0; i < argCount; i++) args.push(stack.pop()!);
  const fn = pluginFunctionRegistry[fnIdx];
  if (!fn) {
    // Plugin unloaded between pre-scan and execution — defensive fallback.
    // Pop args from stack to maintain balance, push sentinel.
    stack.push(numberValue(0));
  } else {
    const result = fn(args.reverse(), vm);
    if (result instanceof Promise) {
      // Promise in sync VM — this is legal at the scheduler level.
      // The orchestrator pre-resolves CALL_PLUGIN functions before VM execution,
      // so by the time the VM runs, the result is already resolved.
      // If a Promise leaks through (orchestrator bypass), the VM throws.
      throw ErrorFactory.execution(
        'ASYNC_PLUGIN_CALL',
        'CALL_PLUGIN returned a Promise inside synchronous VM execution. ' +
        'Plugin functions must be pre-resolved by the orchestrator before VM evaluation.'
      );
    }
    stack.push(result);
  }
  break;
}
```

**Scheduler integration (critical):**

The orchestrator pre-scans bytecode for `CALL_PLUGIN` opcodes before VM execution:

```typescript
// Orchestrator.ts — pre-scan phase
function hasAsyncPluginCalls(bytecode: Bytecode): boolean {
  const { opcodes } = bytecode;
  for (let i = 0; i < opcodes.length; i++) {
    if (opcodes[i] === OpCode.CALL_PLUGIN) return true;
  }
  return false;
}

async evaluate(input: string): Promise<Value> {
  const bytecode = this.compile(input);

  if (hasAsyncPluginCalls(bytecode)) {
    // Pre-resolve all plugin function calls before VM execution.
    // Walk bytecode, find CALL_PLUGIN indices, resolve their args,
    // substitute resolved values into the expression, re-compile.
    // This keeps the VM synchronous while supporting async plugins.
    const resolved = await this.preResolvePluginCalls(bytecode, input);
    return this.engine.evaluateExpression(resolved);
  }

  // No CALL_PLUGIN → pure sync path, no orchestration overhead
  return this.engine.executeBytecode(bytecode);
}
```

**Why this beats a single CALL opcode:**

1. **Scheduler doesn't waste cycles on math**: `sqrt(16) + 2` emits `CALL_BUILTIN` — the scheduler sees zero `CALL_PLUGIN` opcodes and takes the pure sync fast path. No bytecode scanning, no pre-resolution, no DAG analysis.

2. **DAG integration is opt-in**: The DAG only activates when `CALL_PLUGIN` appears in bytecode. This means simple expressions (`1 + 2`, `sqrt(9)`) never touch the DAG — they evaluate directly.

3. **Async is at the scheduler level, VM stays sync**: The VM throws if `CALL_PLUGIN` returns a Promise. The orchestrator guarantees all plugin functions are pre-resolved. This preserves V8 JIT optimization of the VM's hot loop.

4. **Separate registries = separate performance characteristics**: `builtinFunctions` is a dense array of pure sync functions — JIT-inlinable. `pluginFunctionRegistry` may contain async functions and has different lifecycle (register/unregister on plugin load/unload).

5. **Future: async VM checkpoints**: In the deferred async-aware DAG scheduler (§2.3), the scheduler can scan for `CALL_PLUGIN` to pre-identify which lines are blocked on external data, checkpoint the VM, and continue evaluating independent lines. `CALL_BUILTIN` lines are always ready.

**Migration path:**

| Step | Change |
|------|--------|
| 1 | Rename `CALL` (50, dead) → `CALL_PLUGIN` in OpCode enum |
| 2 | Add `CALL_PLUGIN` handler to VM switch (above) |
| 3 | Create `pluginFunctionRegistry` in VMBuiltins.ts |
| 4 | `DomainRegistry.register()` compiles plugin functions into the registry |
| 5 | Orchestrator pre-scans bytecode for `CALL_PLUGIN` |
| 6 | Plugin parselets emit `CALL_PLUGIN fnIdx argCount` instead of `CALL_BUILTIN` |
| 7 | `CALL_BUILTIN` scope expands: add `diceRoll`, future `matmul`, `transpose` |

---

## 7. Cache Strategy

### 7.1 Cache Layers

| Cache | What | Lifetime | Invalidation |
|-------|------|----------|-------------|
| **Bytecode cache** | expression → BytecodeProgram | Engine lifetime | Full clear on plugin register/unregister |
| **LineCache** | line# → result + bytecode + reads/writes | Per-document | DAG dirty tracking |
| **Resolution cache** | expression hash → resolved values | Session | Full clear on plugin register/unregister |
| **Incremental prefix cache** | line# → prefix tokens + bytecode | Per-document | Cleared when line changes entirely |
| **BuilderPool** | Pre-allocated BytecodeBuilder × 4 | Engine lifetime | Never cleared (reset() only) |

### 7.2 Cache Invalidation on Plugin Change

```typescript
// ExpressionEngine.ts — when registerPackage() or registerPlugin() is called
registerPackage(pkg: ISolvePackage): void {
  // ... existing registration ...

  // ⚡ Full clear on any plugin change (simplest, safest)
  this.bytecodeCache.clear();
  this.orchestrator?.clearCaches(); // resolution + incremental caches
}
```

This is intentionally aggressive. It's the safest approach and plugin registration is a rare event (app startup, not per-keystroke). The cost of a stale cache (wrong results) far outweighs the cost of re-parsing a few cached expressions.

---

## 8. Allocation Telemetry Framework

### 8.1 What We Track

Per pipeline stage, track:

| Metric | Lexer | Normalizer | Parser | Semantic | VM | Orchestrator |
|--------|:-----:|:----------:|:------:|:--------:|:--:|:------------:|
| Allocation count | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bytes allocated | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Object count (by type) | Token, LexerToken | Token (PHRASE) | BytecodeProgram | — | Value | Map entries |
| Wall clock (mean/p50/p95/p99) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 8.2 Implementation

```typescript
// src/solve-js/src/telemetry/AllocationTracker.ts

export interface StageAllocation {
  stage: 'lexer' | 'normalizer' | 'parser' | 'resolver' | 'vm' | 'orchestrator';
  allocCount: number;
  allocBytes: number;
  objectCounts: Record<string, number>;
  wallTimeNs: number; // via process.hrtime() or performance.now()
}

export interface PipelineTelemetry {
  expression: string;
  stages: StageAllocation[];
  totalAllocBytes: number;
  totalWallTimeNs: number;
  fastPath: boolean; // true if orchestrator bypassed
}

export class AllocationTracker {
  private static enabled: boolean = false;

  static enable(): void { this.enabled = true; }
  static disable(): void { this.enabled = false; }

  static track<T>(
    stage: StageAllocation['stage'],
    fn: () => T
  ): { result: T; alloc: StageAllocation } {
    if (!this.enabled) {
      return { result: fn(), alloc: null! };
    }

    const startMem = process.memoryUsage?.() ?? null;
    const startTime = process.hrtime?.() ?? performance.now();

    const result = fn();

    const endTime = process.hrtime?.(startTime) ?? performance.now() - (startTime as number);
    const endMem = process.memoryUsage?.() ?? null;

    return {
      result,
      alloc: {
        stage,
        allocCount: 0, // requires --expose-gc and heap snapshots
        allocBytes: endMem && startMem ? endMem.heapUsed - startMem.heapUsed : 0,
        objectCounts: {},
        wallTimeNs: Array.isArray(endTime)
          ? endTime[0] * 1e9 + endTime[1]
          : (endTime as number) * 1e6,
      },
    };
  }

  static generateReport(telemetry: PipelineTelemetry[]): string {
    // Aggregate by stage, output markdown table
    // ...
  }
}
```

### 8.3 CI Integration

```typescript
// benchmarks/allocationBenchmarks.spec.ts

describe('Pipeline Allocation Budgets', () => {
  beforeAll(() => AllocationTracker.enable());

  it('lexer: simple arithmetic should allocate < 10 objects', () => {
    const { alloc } = AllocationTracker.track('lexer', () => lexer.tokenizeAll());
    expect(alloc.allocCount).toBeLessThan(10);
  });

  it('parser: cold compile should allocate < 5 objects (pooled builder)', () => {
    const { alloc } = AllocationTracker.track('parser', () => parser.parseExpression(...));
    expect(alloc.allocCount).toBeLessThan(5);
  });

  it('normalizer: should allocate 0 objects when no vocabs registered', () => {
    const { alloc } = AllocationTracker.track('normalizer', () => normalizer.normalize(tokens));
    expect(alloc.allocCount).toBe(0);
  });

  it('orchestrator: fast-path should allocate 0 extra objects', () => {
    const { alloc } = AllocationTracker.track('orchestrator', () => orchestrator.evaluate("1+2"));
    expect(alloc.fastPath).toBe(true);
    expect(alloc.allocBytes).toBeLessThan(...);
  });
});
```

---

## 9. Per-Layer Performance Budgets

| Layer | Target (cold) | Target (warm) | Allocation Budget | Notes |
|-------|:------------:|:-------------:|:-----------------:|-------|
| **Lexer** | < 10µs | < 3µs | < 10 objects | Existing performance is already excellent |
| **Normalizer** | < 10µs | < 1µs (bypass) | 0 (bypass), < 5 (active) | O(1) bypass when no vocabs |
| **Parser (Tier 1)** | < 150µs | < 5µs (cached) | < 5 objects | Bytecode cache hit = zero parse |
| **Parser (Tier 2)** | < 200µs | < 10µs | < 10 objects | Plugin parselet path |
| **Semantic Resolver** | — | — | 0 (dispatch overhead only) | Pre-compiled into opcodes; coercion exec allocs counted against VM |
| **VM (scalar ops)** | < 5µs | < 1µs | < 2 objects | Unchanged numeric ops |
| **VM (Array + Object ops)** | < 10µs | < 2µs | < 3 objects | ARR_ADD/ARR_SUB composite ops, component-wise; OBJ_GET via V8 inline cache |
| **VM (ARR_INDEX)** | < 2µs | < 0.5µs | 1 (arena-recycled) / 0 (nested, reuses existing Value) | Flat arrays: allocates one Value via arena. Nested arrays: returns existing Value ref. |
| **VM (ARR_SLICE)** | < 5µs | < 1µs | < 2 objects | New Value + number[] allocation |
| **VM (ARR_MAG)** | < 5µs | < 1µs | 1 (arena-recycled) | Computes √(∑v[i]²). O(n) in array length. Returns new number Value (arena-recycled). |
| **VM (ARR_NORM)** | < 8µs | < 2µs | < 2 objects | Divides each component by magnitude. O(n) in array length. New array Value + number[]. |
| **VM (OBJ_GET, OBJ_HAS)** | < 2µs | < 0.5µs (V8 IC) | 0 | Zero-allocation property read/has-check. Returns existing Value ref / arena booleanValue. `hasOwnProperty` guard prevents prototype pollution. |
| **VM (OBJ_SET)** | < 10µs (64-key) | < 3µs (typical) | < 2 objects | Immutable copy of all properties + freeze. O(n) in keys (max 64). New record + Value wrapper. |
| **VM (OBJ_NEW)** | < 10µs (64-key) | < 3µs (typical) | < 2 objects | Object creation + freeze. O(n) in initial keys. |
| **VM (OBJ_KEYS)** | < 10µs (64-key) | < 2µs (typical) | < 3 objects | Creates array Value + N string Values. O(n) in key count. |
| **VM (CALL_BUILTIN)** | < 3µs | < 1µs | < 1 object (arena-pooled args array) | Array lookup + call. JIT-inlinable for monomorphic call sites. Args array arena-recycled. |
| **VM (CALL_PLUGIN)** | < 5µs | < 2µs | < 2 objects | Registry lookup + call. May involve async — but VM throws on Promise (pre-resolved by orchestrator). |
| **Orchestrator (fast)** | < 3µs | < 1µs | 0 | Direct delegate to engine |
| **Orchestrator (full)** | < 50µs + async | < 20µs | < 10 objects | Excluding async resolution |
| **Total pipeline** | < 500µs | < 15µs | < 20 objects | For typical expressions. Note: current cold baseline is ~600µs (Phase 0 measurement TBD). The new parser must be > 20% faster than old Pratt to accommodate added layers within the < 500µs target. |

### CI Regression Thresholds

| Benchmark | Max Allowed (cold) | Max Allowed (warm) |
|-----------|:------------------:|:------------------:|
| `pipeline:single_eval_cold` | 0.50ms (unchanged) | — |
| `pipeline:single_eval_warm` | — | 0.05ms (50µs) |
| `lexer:simple_arithmetic` | 0.01ms (10µs) | — |
| `parser:simple_arithmetic_cold` | 0.20ms (new) | — |
| `parser:simple_arithmetic_warm` | — | 0.02ms (new) |
| `normalizer:no_vocabs` | 0.001ms (1µs bypass) | — |
| `orchestrator:fast_path` | 0.005ms (5µs) | — |
| `allocation:total_per_eval` | 30 objects max (new) | — |
| `array:vec2_add_cold` | 0.02ms (new) | — |
| `array:vec2_add_warm` | — | 0.002ms (new) |
| `array:dot_cold` | 0.010ms (new) | — |
| `array:mag_cold` | 0.010ms (new) | — |
| `array:norm_cold` | 0.010ms (new) | — |
| `array:index_cold` | 0.005ms (new) | — |
| `object:get_cold` | 0.005ms (new) | — |
| `object:get_warm` | — | 0.001ms (new) |
| `object:set_cold` | 0.015ms (new) | — |
| `object:new_cold` | 0.015ms (new) | — |
| `object:keys_cold` | 0.010ms (new) | — |
| `object:has_cold` | 0.005ms (new) | — |
| `call:builtin_cold` | 0.005ms (new) | — |
| `call:plugin_cold` | 0.010ms (new) | — |

---

## 10. Implementation Phases

### Phase 0: Capture New Baseline

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 0.1 | Run full benchmark suite on clean `feat/safety-limits` branch | — | — |
| 0.2 | Save as `benchmarks/results/precedence-climbing-baseline.json` | `benchmarks/results/` | — |
| 0.3 | Document baseline values in PERFORMANCE_BUDGETS.md §2 | `PERFORMANCE_BUDGETS.md` | +20 |
| 0.4 | Add allocation tracking benchmarks | `src/solve-js/__tests__/benchmarks/allocationBenchmarks.spec.ts` | ~150 |

### Phase 1: Allocation Telemetry Framework

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 1.1 | `AllocationTracker` class | `src/solve-js/src/telemetry/AllocationTracker.ts` | ~100 |
| 1.2 | Wire into `ExpressionEngine.evaluateExpressionWithDiagnostic()` | `ExpressionEngine.ts` | +30 |
| 1.3 | `PipelineTelemetry` report generation | `AllocationTracker.ts` | ~80 |
| 1.4 | Jest helpers for allocation assertions | `src/solve-js/tools/allocationTestUtils.ts` | ~60 |
| 1.5 | Tests for allocation tracking | `__tests__/telemetry/` | ~150 |

### Phase 2: Precedence Parser (Hybrid)

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 2.1 | `BindingPower` table — Uint8Array indexed by typeId | `src/solve-js/src/parser/BindingPower.ts` | ~40 |
| 2.2 | `PrecedenceParser` class — hybrid precedence climbing + parselet fallback | `src/solve-js/src/parser/PrecedenceParser.ts` | ~350 |
| 2.3 | Built-in operator inline dispatch (switch on typeId) | `PrecedenceParser.ts` | ~200 |
| 2.4 | Plugin parselet fallback path (uses existing `ParseletRegistry`) | `PrecedenceParser.ts` | ~50 |
| 2.5 | Integrate `BytecodeBuilder` (unchanged) | `PrecedenceParser.ts` | ~30 |
| 2.6 | Incremental re-parse (suffix-only) + DAG integration | `src/solve-js/src/parser/IncrementalParser.ts` | ~180 |
| 2.7 | Bytecode comparison test: new parser vs old parser for 50+ expressions | `__tests__/parser/bytecodeComparison.spec.ts` | ~200 |
| 2.8 | Replace `this.parser` in `ExpressionEngine` with `PrecedenceParser` | `ExpressionEngine.ts` | +20 |
| 2.9 | Remove `RecursiveDescentParser`, `RecursiveDescentBootstrap`, `useRecursiveDescent` config | Multiple | -80 |
| 2.10 | Ensure all existing 200+ tests pass with new parser | — | — |
| 2.11 | Parser benchmarks — compare vs old `Parser.ts` | `__tests__/benchmarks/parserBenchmarks.spec.ts` | +50 |
| 2.12 | Collapse `ValueType.Vector2/3/4` → `ValueType.Array` in enum | `src/solve-js/src/vm/Value.ts` | ~15 |
| 2.13a | Remove `OpCode.DICE_ROLL` (110) — migrate to `CALL_BUILTIN` function | `src/solve-js/src/parser/OpCode.ts` | -2 |
| 2.13b | Add `diceRoll` to `builtinFunctions[]` — two-arg function: `(from, to) → random int` | `src/solve-js/src/vm/VM.ts` | +5 |
| 2.13c | Update `DiceRollParselet`/`DiceRangeParselet` — `emitOpcode(DICE_ROLL)` → `emitBuiltinCall(diceRollIndex, 2)` | `src/solve-js/src/providers/dice/parselets/` | ~10 |
| 2.13d | Update tests — `DICE_ROLL` → `CALL_BUILTIN` diceRoll | `__tests__/` (multiple) | ~15 |
| 2.13e | Rename `VEC_*` → `ARR_*` opcodes in `OpCode` enum | `src/solve-js/src/parser/OpCode.ts` | ~10 |
| 2.14 | Update `binaryOp()` — single `ValueType.Array` check replaces 6 enum comparisons | `src/solve-js/src/vm/VMConversion.ts` | ~30 |
| 2.15 | Update VM switch — `ARR_ADD/ARR_SUB/ARR_DOT/ARR_CROSS/ARR_SCALE/ARR_MAG/ARR_NORM/ARR_INDEX/ARR_SLICE/ARR_LEN` opcodes | `src/solve-js/src/vm/VM.ts` | ~150 |
| 2.16 | Update `BytecodeBuilder` — emit `ARR_*` opcodes + `emitArrayAccess()` | `src/solve-js/src/parser/BytecodeBuilder.ts` | ~40 |
| 2.17 | Update vector parselets → emit `ARR_*` instead of `VEC_*` | `src/solve-js/src/providers/vector/parselets/` | ~20 |
| 2.18 | Update `FormatEngine` — `ValueType.Array` case replaces Vec2/3/4 cases | `src/solve-js/src/format/FormatEngine.ts` | ~10 |
| 2.19 | Update `RecursiveDescentBootstrap` — emit `ARR_*` | `src/solve-js/src/parser/RecursiveDescentBootstrap.ts` | ~10 |
| 2.20 | Update all tests — `ValueType.Array` instead of `Vector2/3/4` | `__tests__/` (multiple) | ~50 |
| 2.21 | Tests — nested arrays (`[[1,2],[3,4]]`), `ARR_INDEX`, `ARR_SLICE` | `__tests__/vm/array.spec.ts` | ~200 |
| 2.22 | Tests — vec2/vec3/vec4 ops produce identical results with `ARR_*`; N-dimensional dot/mag/norm tests | `__tests__/vm/arrayCompat.spec.ts` | ~150 |
| 2.23 | `ValueType.Object` in enum (value 10), `isObject()`, `objectValue()` factory | `src/solve-js/src/vm/Value.ts` | ~25 |
| 2.24 | Object opcodes: `OBJ_NEW/GET/SET/HAS/KEYS` in `OpCode` enum | `src/solve-js/src/parser/OpCode.ts` | ~10 |
| 2.25 | VM switch — `OBJ_NEW/OBJ_GET/OBJ_SET/OBJ_HAS/OBJ_KEYS` handlers | `src/solve-js/src/vm/VM.ts` | ~100 |
| 2.26 | `BytecodeBuilder` — `emitObjectNew()`, `emitObjectGet()`, `emitObjectSet()` | `src/solve-js/src/parser/BytecodeBuilder.ts` | ~50 |
| 2.27 | Parser: object literals `{key: val}`, dot access `obj.prop`, bracket access `obj["key"]`, shorthand `{x}`, trailing commas | `src/solve-js/src/parser/PrecedenceParser.ts` | ~200 |
| 2.28 | Tests — object literals, dot/bracket access, nested objects, immutability | `__tests__/vm/object.spec.ts` | ~250 |
| 2.29 | Tests — object + array interop (`obj.arr[i].prop`) | `__tests__/vm/objectArrayInterop.spec.ts` | ~100 |
| 2.30 | Rename `CALL` (50) → `CALL_PLUGIN` in OpCode enum | `src/solve-js/src/parser/OpCode.ts` | ~3 |
| 2.31 | Add `CALL_PLUGIN` handler to VM switch | `src/solve-js/src/vm/VM.ts` | ~25 |
| 2.32 | Create `pluginFunctionRegistry` in VMBuiltins.ts | `src/solve-js/src/vm/VMBuiltins.ts` | ~10 |
| 2.33 | Orchestrator bytecode pre-scan for `CALL_PLUGIN` | `src/solve-js/src/orchestration/Orchestrator.ts` | ~40 |
| 2.34 | Tests — CALL_BUILTIN vs CALL_PLUGIN dispatch correctness | `__tests__/vm/callDispatch.spec.ts` | ~100 |

### Phase 3: Phrase Normalizer

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 3.1 | `PhraseNormalizer` — trie-based IDENT merging | `src/solve-js/src/lexer/PhraseNormalizer.ts` | ~120 |
| 3.2 | Configurable strategy: in-lex vs post-lex per entry | `DomainSpec` type changes | +20 |
| 3.3 | `hasVocabs` bypass guard — O(1) no-op when empty | `PhraseNormalizer.ts` | +5 |
| 3.4 | Integrate into `ExpressionEngine.evaluateWithTokens()` | `ExpressionEngine.ts` | +5 |
| 3.5 | Tests — "Iron Axe + Dragon Hide" normalizes | `__tests__/lexer/PhraseNormalizer.spec.ts` | ~150 |

### Phase 4: Semantic Resolver (Pre-Compiled Coercions)

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 4.1 | `ValueTypeRegistry` + `CoercionRegistry` (from PLAN_06 §3) | `src/solve-js/src/vm/` | ~200 |
| 4.2 | `DomainRegistry.register()` — compiles operators into coercion opcodes | `src/solve-js/src/plugins/DomainRegistry.ts` | ~150 |
| 4.3 | VM: `OpCode.COERCE` + `OpCode.CUSTOM_ADD` (minimal type dispatch) | `src/solve-js/src/vm/VM.ts` | +30 |
| 4.4 | `Value.customType` + `Value.customValue` fields | `src/solve-js/src/vm/Value.ts` | +15 |
| 4.5 | Tests — coercion compilation + VM execution | `__tests__/vm/coercion.spec.ts` | ~200 |

### Phase 5: Orchestrator

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 5.1 | `Orchestrator` class — two-phase token scan + async pipeline | `src/solve-js/src/orchestration/Orchestrator.ts` | ~250 |
| 5.2 | `ResolverRegistry` — named async resolvers with timeout + plugin-unload guard | `src/solve-js/src/plugins/ResolverRegistry.ts` | ~100 |
| 5.3 | Resolution cache + invalidation on plugin change + in-flight Promise guard | `Orchestrator.ts` | +60 |
| 5.4 | Wire orchestrator as `ExpressionEngine` entry point; integrate into `processScanResults()` | `ExpressionEngine.ts` | +40 |
| 5.5 | Integration test — mini OSRS domain end-to-end | `__tests__/orchestration/osrsIntegration.spec.ts` | ~300 |
| 5.6 | Test: `5 in gp` correctly takes full orchestration path (not fast-pathed) | `__tests__/orchestration/osrsIntegration.spec.ts` | +30 |

### Phase 6: Polish + Documentation

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 6.1 | Remove dead code: old `Parser.ts`, `RecursiveDescentParser.ts` references | Multiple | -500 |
| 6.2 | Update `ARCHITECTURE_PRINCIPLES.md` with new pipeline diagram | `ARCHITECTURE_PRINCIPLES.md` | +50 |
| 6.3 | Update `PERFORMANCE_BUDGETS.md` with new per-layer targets | `PERFORMANCE_BUDGETS.md` | +30 |
| 6.4 | Run full CI suite (typecheck + lint + test + benchmarks) | — | — |
| 6.5 | Compare Phase 0 baseline vs Phase 6 benchmarks → report | — | — |

---

## 11. MVP Definition

**"Full pipeline + one plugin":**

1. **Parser**: `PrecedenceParser` replaces `Parser`; all existing providers work through Tier 2 (parselet fallback)
2. **Normalizer**: `PhraseNormalizer` with `hasVocabs` bypass; no registered vocabs → zero overhead
3. **Semantic Resolver**: `DomainRegistry` compiles coercions into bytecode; VM dispatches custom types
4. **Orchestrator**: Fast-path detect delegates non-plugin expressions directly to engine
5. **Plugin**: One real end-to-end domain plugin (mini OSRS: two items, gp type, `+` operator, `in` keyword, async price resolver)
6. **DICE_ROLL → CALL_BUILTIN**: `OpCode.DICE_ROLL` removed from enum. Dice rolling is a `CALL_BUILTIN` function. Dice parselets emit `CALL_BUILTIN diceRollIndex, 2` instead of `DICE_ROLL`. All existing dice roll tests pass with identical results. Clean opcode numbering: 109–113 open for OBJ_*, 114–115 for ARR_MAG/NORM.
7. **Array unification**: `ValueType.Array` replaces `Vector2/3/4`. All existing vector operations produce identical results. `ARR_DOT`/`ARR_MAG`/`ARR_NORM` work on arrays of any dimension N (1–8, depth-limited). `ARR_CROSS` requires length 3. `ARR_INDEX` and `ARR_SLICE` work on arrays of any length. Nested arrays (`[[1,2],[3,4]]`) parse and evaluate.
8. **Object support**: `ValueType.Object` stores immutable `Record<string, Value>`. Full JS-like syntax works: `{name: "x", price: 8000}`, `obj.prop`, `obj["key"]`, shorthand `{x}`, trailing commas, mixed `obj.arr[2].prop`. Plugin resolvers return objects, VM accesses fields via standard `OBJ_GET`.
9. **Object immutability**: `OBJ_SET` creates new object with updated property — original unchanged. Object size ≤ 64 keys, nesting ≤ 8 levels.
10. **All tests pass**: All existing 200+ tests pass unchanged (with `ValueType.Vector2` → `ValueType.Array` expect updates)
11. **CALL_PLUGIN / CALL_BUILTIN split**: `CALL` (50, dead) repurposed as `CALL_PLUGIN`. `CALL_BUILTIN` (51) scope expanded to include `diceRoll`. Plugin functions register via `pluginFunctionRegistry`. Orchestrator pre-scans bytecode for `CALL_PLUGIN` to determine async path. `sqrt(9) + 2` takes pure sync fast path (no DAG analysis).
12. **Benchmarks**: Zero regression on existing benchmarks; array ops (ARR_ADD) are ≥ 1.0× baseline VEC_ADD speed; object ops (OBJ_GET warm) are ≤ 0.5µs; new per-layer benchmarks show improvements

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| **Parser regression** — new parser produces different bytecode than old | Medium | High | Run full test suite on every parser change. Bytecode comparison tool. |
| **Performance regression** — hybrid dispatch slower than pure Pratt for plugin-heavy expressions | Low | Medium | Plugin path is rarely hit. Benchmark both paths. Tier 2 overhead is one Map.get(). |
| **Incremental parse bugs** — cached prefix invalid when DAG changes | Medium | Medium | Clear incremental cache on variable write. Conservative invalidation. |
| **Orchestrator fast-path false negatives** — domain expressions misclassified as arithmetic | Medium | High | Two-phase token scan (all tokens, not just first). Test ALL domain patterns including number-first (`5 in gp`, `100 USD`). False positives acceptable (rare, < 5µs extra). False negatives are NOT acceptable. |
| **Allocation tracking overhead** — telemetry itself allocates, skewing measurements | Medium | Low | Telemetry only in CI/test. Disabled in production by `AllocationTracker.enabled = false`. |
| **Normalizer trie rebuild** — rebuilding trie on plugin register is O(total vocabulary words) | Low | Low | Acceptable — plugin registration is startup-only. Cap vocabulary at 10,000 entries. |
| **VM custom type dispatch** — switch on typeId ≥ 100 adds branch to hot loop | Low | Medium | V8 branch predictor handles well when custom types are rare. Measure with benchmarks. |
| **Plugin unload during async resolution** — in-flight Promise writes stale data to cleared cache | Low | Medium | Orchestrator checks resolver.isRegistered before committing results. Set `unloaded` flag on resolver, skip in-flight results if flag is set. |
| **Bytecode format incompatibility** — new parser produces different bytecode than old parser | Medium | High | Bytecode comparison test (Phase 2.7). Verify 50+ canonical expressions produce identical opcode sequences. |
| **Coercion re-compilation stale** — resolver function updated without full domain re-registration | Low | Low | Domain re-registration is the expected update path. Document that `registerDomain()` must be called again to update resolvers. |
| **Array unification — vector regression** — `ARR_ADD` produces different results than `VEC_ADD` | Medium | High | Comprehensive compat test (Phase 2.22): run all existing vector benchmark expressions through both old and new VM, assert identical results. |
| **Array unification — N-dimensional correctness** — `ARR_DOT`/`ARR_MAG`/`ARR_NORM` produce wrong results for N>4 vectors | Low | Medium | Test dot/mag/norm on dimensions 2–10 against known results. `ARR_MAG` zero-vector returns 0 (not NaN). `ARR_NORM` zero-vector returns zero-vector (not NaN). |
| **Array unification — nested array explosion** — deeply nested arrays allocate exponentially | Low | Medium | Limit nesting depth to 8 levels (configurable). Complexity check rejects deeper nesting. |
| **ARR_INDEX bounds violation** — index out of range on malformed bytecode | Low | Medium | VM returns `numberValue(0)` for out-of-bounds index (defensive, same as LOAD_VAR fallback). Parser guarantees valid indices on correct parse. |
| **PLUGIN_CUSTOM abuse** — plugins bypass standard opcodes for performance, fragmenting the optimization surface | Low | Medium | Documentation + lint rule: warn when plugin emits PLUGIN_CUSTOM for operations composable from standard opcodes. Review plugin submissions for unnecessary custom ops. |
| **Object prototype pollution** — `OBJ_GET`/`OBJ_HAS` accessing inherited `Object.prototype` members (`toString`, `valueOf`) | Low | Medium | Both opcodes use `hasOwnProperty` guard exclusively. Tests verify that `obj.toString` returns `numberValue(0)`, not a function. |
| **Object.freeze() dictionary mode** — variable key shapes across instances degrade V8 inline caching | Low | Low | Plugin resolvers should return consistent key shapes. Performance degradation is a soft penalty (slower property access), not a correctness issue. Document the best practice. |
| **Object key count abuse** — malicious plugin or expression creates objects with excessive keys | Low | Medium | Hard cap at 64 keys per object. Configurable via `maxObjectKeys`. `OBJ_SET` rejects if adding a key exceeds the limit. |
| **CALL_PLUGIN Promise leak** — async plugin function returns Promise inside synchronous VM execution | Low | High | VM throws `ASYNC_PLUGIN_CALL` error on Promise return. Orchestrator guarantees pre-resolution before VM execution. Integration test verifies Promise rejection. |
| **CALL_PLUGIN registry invalidation** — plugin unloads but registry entry persists, causing stale function calls | Low | Medium | `DomainRegistry.unregister()` clears `pluginFunctionRegistry[fnIdx] = undefined`. Orchestrator clears resolution cache on plugin change. |

---

## 13. Success Criteria

1. **Zero regression**: All 200+ existing tests pass. Existing benchmarks show no regression (> 0.95× baseline for all metrics).
2. **Parser hybrid dispatch**: `1 + 2 * 3` evaluates entirely in Tier 1 (zero parselet registry lookups). Plugin expressions fall through to Tier 2 only for non-built-in tokens.
3. **Normalizer bypass**: Expressions without domain vocabulary show zero normalizer overhead (measured via allocation tracker: 0 allocs, 0 objects).
4. **Orchestrator fast-path**: `1 + 2` detected as non-plugin in O(1) token peek, delegated directly to `engine.evaluateExpression()`. Zero orchestration overhead.
5. **Full pipeline end-to-end**: Mini OSRS plugin (`Iron Axe + Dragon Hide in gp`) resolves through all 5 layers, fetches async prices, returns correct result.
6. **Array unification**: `ValueType.Array` replaces `Vector2/3/4`. All existing vector operations produce identical results. `ARR_DOT`/`ARR_MAG`/`ARR_NORM` work on arrays of any dimension N (1–8, depth-limited). `ARR_CROSS` requires length 3. `ARR_INDEX` and `ARR_SLICE` work on arrays of any length. Nested arrays (`[[1,2],[3,4]]`) parse and evaluate.
7. **Array compat tests**: Vec2/Vec3/Vec4 operations produce identical numeric results through `ARR_*` opcodes as through old `VEC_*` opcodes. `dot([1,2,3,4,5], [5,4,3,2,1])` === 35. `mag([3,4])` === 5. `norm([3,4])` ≈ [0.6, 0.8]. Zero-vector `mag([0,0,0])` === 0. Zero-vector `norm([0,0,0])` === [0,0,0].
8. **PLUGIN_CUSTOM preserved**: Plugin opcode handler escape hatch remains functional. Standard opcodes (PUSH, ARR_*, COERCE, CALL) cover the 90% case; PLUGIN_CUSTOM covers the 10% escape case.
9. **Allocation budgets met**: Per-layer allocation counts within budget (see §9). Telemetry framework produces per-stage breakdowns.
10. **Plugin lifecycle**: Plugin register/unregister clears all caches (bytecode, resolution, incremental). No stale data survives.
11. **Object literals**: `{name: "x", price: 8000}` parses and evaluates correctly. Empty objects (`{}`) supported. Trailing commas, shorthand `{x}`, dot access, bracket access, numeric index coercion, and mixed `obj.arr[i].prop` all produce correct results.
12. **Object immutability**: `OBJ_SET` creates a new object with updated property — original object unchanged. `Object.freeze()` prevents mutation. Prototype pollution prevented: `OBJ_GET` and `OBJ_HAS` use `hasOwnProperty` exclusively.
13. **Object safety**: `OBJ_GET` on missing key returns `numberValue(0)`. `OBJ_GET`/`OBJ_SET`/`OBJ_HAS` on non-object throw type error. 64-key limit enforced.
14. **Documentation updated**: ARCHITECTURE_PRINCIPLES.md reflects new pipeline. PERFORMANCE_BUDGETS.md has per-layer targets.

---

## 14. Open Questions / Deferred Items

| Item | Status | Notes |
|------|:------:|-------|
| Plugin discovery (file-system scan) | **Deferred** | Not in MVP scope. PLAN_06 Phase E. |
| Namespace isolation (priority system) | **Deferred** | Not needed for single-plugin MVP. |
| Plugin settings → Obsidian SettingsTab bridge | **Deferred** | PLAN_06 Phase E. |
| PEG-like extension points for custom syntax | **Deferred** | Tier 2 parselets cover this for now. |
| Coercion re-compilation (stale resolvers) | **Deferred** | Domain re-registration is expected update path. |
| `RecursiveDescentParser` removal from config | **In MVP** | `useRecursiveDescent` config flag and `RecursiveDescentBootstrap` removed. |
| Worker-based parallel evaluation | **Unchanged** | `evaluateParallel()` unaffected by parser change. |
| PLUGIN_CUSTOM opcode handler | **Preserved** | Remains as escape hatch for truly non-composable operations (see §6.3). Plugins SHOULD prefer standard opcodes. Decision rule: if composable from PUSH/ARR_*/COERCE/CALL → use standard; if fundamentally non-composable → use PLUGIN_CUSTOM. |
| Element-level DAG tracking | **Deferred** | Level C from Array unification roadmap. Requires per-index dependency tracking in the incremental parser. Deferred until spreadsheet-like array documents prove the need. |
| Property-level DAG for objects | **Deferred** | MVP uses variable-level tracking (change to `obj` invalidates all consumers). Property-level tracking is the object counterpart to element-level DAG for arrays — deferred until structured object documents prove the need. |
| Computed property names (`{[expr]: val}`) | **Deferred** | Dynamic key computation inside object literals. Bracket access (`obj[expr]`) is supported in MVP. Computed keys in literals require parser-level expression evaluation during object construction. Deferred to Phase 6+. |
| Async VM checkpoints (lazy execution) | **Deferred** | VM stays synchronous per-line. Async is at the scheduler level — the engine/DAG decides which lines are ready vs blocked on unresolved domain values. `CALL_PLUGIN` opcodes in bytecode signal which lines may block. Checkpoint infrastructure (VMCheckpointer) already exists; needs an `AsyncScheduler` that extends ThreeTierEvaluator with dataflow-style readiness tracking. Deferred to Phase 6+. |
| Matrix operations (`matmul`, `transpose`) | **Deferred** | An N×M matrix is naturally a nested `ValueType.Array`. Matrix multiply and transpose are pure functions — no new opcodes needed. Implement as `CALL_BUILTIN` functions: `matmul(A, B)` (N×K · K×M → N×M) and `transpose(A)` (N×M → M×N). Matrix add/sub/scale already work via ARR_ADD/ARR_SUB/ARR_SCALE recursively. Parser syntax: standard function call. Deferred to Phase 6+. |

---

## 15. References

- `plans/PLAN_06_plugin_system_integration.md` — Plugin architecture (4-tier API)
- `plans/MASTER_PLAN.md` — Overall project master plan
- `ARCHITECTURE_PRINCIPLES.md` — Module responsibilities and dependencies
- `PERFORMANCE_BUDGETS.md` — Current baselines and CI thresholds
- `src/solve-js/src/parser/Parser.ts` — Current Pratt parser
- `src/solve-js/src/parser/RecursiveDescentParser.ts` — RD parser (to be dropped)
- `src/solve-js/src/lexer/ExpressionLexer.ts` — Current lexer with phrase trie
- `src/solve-js/src/engine/ExpressionEngine.ts` — Pipeline orchestrator
- `src/solve-js/src/vm/VM.ts` — Bytecode VM
- `src/solve-js/src/vm/Value.ts` — Value type system (Vector2/3/4 → Array unification target)
- `src/solve-js/src/vm/VMConversion.ts` — binaryOp + vector dispatch (6 enum checks → 1)
- `src/solve-js/src/vm/DependencyGraph.ts` — Variable-level DAG (see §6.4 for future element-level)
