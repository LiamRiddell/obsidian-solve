# PLAN 06 — Plugin System Integration & External API

> **Created:** 2026-05-30 | **Status:** ⏸️ Plan Only — Awaiting Implementation Decision
> **Dependencies:** None (builds on existing infrastructure)
> **Target:** Four-tier plugin API (Level 0 macros → Level 3 parselets) + orchestration layer

---

## Executive Summary

The `solve-js` engine already has strong plugin infrastructure — `LexerPlugin` (custom tokens), `ParseletRegistry` (custom parselets), `ISolvePackage` (data-driven registration), `SolvePlugin` (lifecycle), and `PluginManager`. What's missing is:

1. **Simple plugin entry point** — "Current time" → value should be a one-liner, not a full domain spec
2. **Type/coercion system** — `ValueType` is a closed enum; plugins can't add custom types
3. **Async resolver layer** — pipeline is fully synchronous; no hook for "resolve these identifiers after parsing"
4. **Multi-word phrase normalization** — `Iron Axe` lexes as two `IDENT` tokens, not merged
5. **Clean external API** — `SolveAPI.ts` exposes internal details (`ParseletRegistry`, `OpCode`, `Value`)

The plan introduces a **four-tier plugin API** that scales from dead-simple (`registerMacro()`) to fully
custom (`registerPrefixParselet()`), plus an orchestration layer for async resolution — all with minimal
disruption to the existing fast-path performance.

---

## 1. Design Overview — Four-Tier Plugin API

Plugins range from dead-simple ("Current time" → value) to fully custom (new syntax). The API is organized
by **what the plugin author wants to achieve**, not by technical architecture.

```
┌─────────────────────────────────────────────────────────────┐
│  Level 0: Keyword/Macro Provider (~60% of plugins)          │
│  registerConstant(name, value)                              │
│  registerMacro(pattern, (args) => value)                    │
│  → One-liner: map a word or pattern to a value/function     │
│  → Examples: "Current time", "pi", "sqrt(16)", "roll 2d6"  │
└────────────────────────┬────────────────────────────────────┘
                         │ (Level 0 is implemented as a thin   │
                         │  wrapper over Level 1 internally)   │
┌────────────────────────▼────────────────────────────────────┐
│  Level 1: Domain API (~30% of plugins)                      │
│  registerDomain({ namespace, vocabulary, keywords,          │
│    types?, operators?, coercions?, resolvers? })            │
│  → Declare a domain's nouns, units, and data fetchers       │
│  → All fields optional — use only what you need             │
│  → Examples: "5 km in miles", "1 BTC in USD",              │
│    "Iron Axe + Dragon Hide in gp"                           │
└────────────────────────┬────────────────────────────────────┘
                         │ (DomainRegistry auto-generates      │
                         │  parselets, opcodes, lexer plugins) │
┌────────────────────────▼────────────────────────────────────┐
│  Level 2: Operator/Coercion API (~8% of plugins)            │
│  registerDomain({ ..., operators, coercions })              │
│  → Same registerDomain(), but using operator/coercion fields │
│  → Customize how +/*/in work for domain types               │
│  → Examples: date math, vector arithmetic, unit conversion  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Level 3: Parselet API (~2% of plugins)                     │
│  registerPrefixParselet(tokenType, parselet)                │
│  registerInfixParselet(tokenType, parselet, bp)             │
│  registerOpcodeHandler(opcode, handler)                     │
│  → Full control over parsing, bytecode, and VM execution    │
│  → Examples: custom if/else, list comprehensions, new syntax│
└─────────────────────────────────────────────────────────────┘
```

All four levels feed into the same underlying registries. Each higher level auto-generates the
primitives of the level below it.

---

## 2. Plugin Complexity Spectrum — "What Do You Want to Achieve?"

Plugin authors should find their tier by asking **what they want to accomplish**, not by studying
architecture. This section is designed to be the documentation entry point.

### Level 0 — "I want the calculator to understand a new word or simple function."

**Use when:** You have a keyword or pattern that maps directly to a value. No types, no operators,
no vocabulary, no async resolution needed.

| Example | Input | Output | API |
|---------|-------|--------|-----|
| Current time | `Current time` | `"2026-05-30 14:22:00"` | `registerMacro('Current time', () => new Date().toISOString())` |
| Constant | `pi` | `3.1415926535` | `registerConstant('pi', Math.PI)` |
| Simple function | `sqrt(16)` | `4` | `registerMacro('sqrt', (n) => Math.sqrt(n))` |
| Dice roller | `roll 2d6` | random 2–12 | `registerMacro(/roll (\d+)d(\d+)/, (count, sides) => ...)` |
| Counter | `counter` | incrementing number | `registerMacro('counter', () => state.counter++)` |
| Random | `rand` | random 0–1 | `registerConstant('rand', () => Math.random())` |

**API surface:**
```typescript
// Literal constant — computed once at registration time
solve.registerConstant(name: string, value: unknown): void;

// Dynamic macro — recomputed on every evaluation
solve.registerMacro(
  pattern: string | RegExp,
  resolver: (...capturedArgs: string[]) => unknown
): void;
```

**Implementation note:** Both `registerConstant()` and `registerMacro()` are thin wrappers that
internally create an anonymous Level 1 domain with just `keywords`/`phrases` + `resolvers`. The
plugin author never sees this — it's a dead-simple API backed by the full infrastructure.

### Level 1 — "I want to define domain vocabulary and fetch external data."

**Use when:** You have multi-word entities ("Iron Axe"), units ("gp", "USD"), or need async data
fetching (price APIs). The engine handles all the math — you just provide the nouns and their values.

| Example | Input | Output | Key Fields Used |
|---------|-------|--------|-----------------|
| Unit converter | `5 km in miles` | `3.10686` | `vocabulary`, `types` |
| Crypto prices | `1 BTC in USD` | `67234.50` | `vocabulary`, `keywords`, `resolvers` |
| OSRS items | `Iron Axe in gp` | `5000` | `vocabulary`, `keywords`, `resolvers` |
| Weather | `temp in London` | `"15°C"` | `vocabulary`, `resolvers` |

**API surface:**
```typescript
solve.registerDomain({
  namespace: 'mydomain',
  version: '1.0.0',

  // Only fill in what you need — all fields optional
  vocabulary?: Record<string, string>,    // "Iron Axe" → "item"
  keywords?: Record<string, string>,      // "gp" → "osrs.gp"
  types?: Array<{ name, extends?, formatter? }>,
  resolvers?: Record<string, (ids: string[]) => Promise<Map<string, unknown>>>,
});
```

### Level 2 — "I want to customize how operators work for my types."

**Use when:** You need to override or extend how `+`, `-`, `*`, `/`, `in`, `of`, `per` behave
for your domain types. Same `registerDomain()` API — just add `operators` and `coercions`.

| Example | Input | Output | Key Fields Added |
|---------|-------|--------|------------------|
| Date math | `Jan 1 + 5 days` | `Jan 6` | `operators`, `coercions` |
| Vector math | `[1, 2] + [3, 4]` | `[4, 6]` | `operators`, `coercions` |
| OSRS arithmetic | `Iron Axe + Dragon Hide` | `8000` | `operators`, `coercions` |
| Custom units | `5 kg + 3 lbs in g` | `6360.4` | `operators`, `coercions` |

**API surface (additional fields on `registerDomain()`):**
```typescript
solve.registerDomain({
  // ... Level 1 fields ...

  operators?: Array<{
    op: '+' | '-' | '*' | '/' | '^' | '%' | 'in' | 'of' | 'per';
    lhs: string;
    rhs: string;
    returns: string;
    coerceLhs?: string;   // Convert LHS to this type before operating
    coerceRhs?: string;   // Convert RHS to this type before operating
    via?: string;         // Named resolver for the result
  }>,

  coercions?: Array<{
    from: string;
    to: string;
    via: string;          // Named resolver: "mydomain.toNumber"
  }>,
});
```

### Level 3 — "I want to invent entirely new syntax."

**Use when:** You need grammar that can't be expressed as infix operators, keywords, or phrases.
Custom parselets give you full control over token consumption and bytecode emission.

| Example | Input | Output | API |
|---------|-------|--------|-----|
| If/else | `if x > 5 then 10 else 0` | `10` | `registerPrefixParselet('IF', ...)` |
| List comprehension | `[x * 2 for x in 1..5]` | `[2, 4, 6, 8, 10]` | `registerPrefixParselet('[', ...)` |
| Custom postfix | `5!` (factorial) | `120` | `registerInfixParselet('!', ...)` |
| DSL embedding | `SELECT age FROM users WHERE name = 'Alice'` | query result | `registerPrefixParselet('SELECT', ...)` |

**API surface:**
```typescript
// Register a prefix parselet (consumed before its operands)
solve.registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void;

// Register an infix parselet (consumed between left and right operands)
solve.registerInfixParselet(tokenType: string, parselet: InfixParselet, bindingPower: number): void;

// Register a custom VM opcode handler
solve.registerOpcodeHandler(opcode: number, handler: OpcodeHandler): void;
```

### Decision Flowchart

```
"I want the calculator to understand X."
              │
              ▼
     Is X a single word/pattern that maps to a value?
              │
     ┌────YES┴────NO┐
     ▼               ▼
  Level 0       Does X involve domain entities (items, units, prices)?
  registerMacro         │
  registerConstant ┌────YES┴────NO┐
                    ▼               ▼
               Level 1         Do you need to customize how operators work?
               registerDomain        │
               (vocabulary,     ┌────YES┴────NO┐
                resolvers)       ▼               ▼
                            Level 2         Level 3
                            registerDomain  registerPrefixParselet
                            (operators,     registerInfixParselet
                             coercions)
```

---

## 3. Component Design

### 3.1 Value Type System — Plugin-Extensible Types

**Current:** `ValueType` is a `const enum` with 12 closed variants. Plugin values must be squeezed into existing types.

**Proposed:** Dynamic type registration with numeric IDs.

```typescript
// src/solve-js/src/vm/ValueTypeRegistry.ts

export interface CustomValueType {
  /** Unique identifier — prefixed with plugin namespace */
  name: string;
  /** Numeric ID assigned at registration (≥ 100 to avoid core collisions) */
  id: number;
  /** How to display this value */
  formatter?: (value: CustomValue) => string;
  /** Coercion priority (higher = preferred target type) */
  coercionPriority?: number;
}

/** A value with a plugin-defined type. */
export interface CustomValue {
  typeId: number;
  value: unknown;
  /** Optional unit for UoM-like plugin types */
  unit?: string;
}

export class ValueTypeRegistry {
  private static nextId = 100; // Reserve 0-99 for core types
  private static types = new Map<string, CustomValueType>();
  private static byId = new Map<number, CustomValueType>();

  static register(namespace: string, name: string, spec: Partial<CustomValueType>): CustomValueType {
    const fullName = `${namespace}.${name}`;
    if (this.types.has(fullName)) {
      throw new Error(`Value type "${fullName}" already registered`);
    }
    const type: CustomValueType = {
      name: fullName,
      id: this.nextId++,
      ...spec,
    };
    this.types.set(fullName, type);
    this.byId.set(type.id, type);
    return type;
  }

  static getByName(name: string): CustomValueType | undefined {
    return this.types.get(name);
  }

  static getById(id: number): CustomValueType | undefined {
    return this.byId.get(id);
  }

  /** Unregister all types for a namespace (plugin unload). */
  static unregisterNamespace(namespace: string): void {
    const prefix = `${namespace}.`;
    for (const [name, type] of this.types) {
      if (name.startsWith(prefix)) {
        this.types.delete(name);
        this.byId.delete(type.id);
      }
    }
  }
}
```

**Value integration:** The existing `Value` class gains a `customType?: CustomValueType` field. The core `ValueType` enum remains unchanged — custom types exist alongside, not instead of.

```typescript
// Value.ts additions
export class Value {
  // ... existing fields ...
  public customType?: CustomValueType;
  public customValue?: unknown;

  /** True if this Value represents a plugin-defined type. */
  isCustom(): boolean {
    return this.customType !== undefined;
  }
}
```

### 3.2 Coercion Registry — Type Conversion Rules

Plugins declare how types convert: `item → number` (via price lookup), `gp → number` (direct), etc.

```typescript
// src/solve-js/src/vm/CoercionRegistry.ts

export interface CoercionRule {
  /** Source type name (e.g., "osrs.item") */
  from: string;
  /** Target type name (e.g., "number") */
  to: string;
  /** 
   * Resolver function. Called with the source value, returns the target.
   * Synchronous — async resolution happens in the orchestration layer.
   */
  convert: (value: Value, vm: VM) => Value;
  /** Priority — higher tries first. Default: 0 */
  priority?: number;
}

export class CoercionRegistry {
  // from → (to → rule)
  private rules = new Map<string, Map<string, CoercionRule[]>>();

  register(rule: CoercionRule): void {
    const fromMap = this.rules.get(rule.from) ?? new Map();
    const rules = fromMap.get(rule.to) ?? [];
    rules.push(rule);
    rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    fromMap.set(rule.to, rules);
    this.rules.set(rule.from, fromMap);
  }

  /** Find the best coercion path from source to target. Returns null if none. */
  findCoercion(from: string, to: string): CoercionRule | null {
    const fromMap = this.rules.get(from);
    if (!fromMap) return null;
    const rules = fromMap.get(to);
    if (!rules || rules.length === 0) return null;
    return rules[0]; // Highest priority
  }

  /** Shorthand: can this conversion be performed? */
  canCoerce(from: string, to: string): boolean {
    return this.findCoercion(from, to) !== null;
  }

  /** Execute coercion. Throws if no rule exists. */
  coerce(value: Value, targetType: string, vm: VM): Value {
    const fromName = value.customType?.name ?? ValueType[value.type];
    const rule = this.findCoercion(fromName, targetType);
    if (!rule) {
      throw new Error(
        `Cannot coerce "${fromName}" to "${targetType}": no coercion rule registered`
      );
    }
    return rule.convert(value, vm);
  }

  unregisterNamespace(namespace: string): void {
    const prefix = `${namespace}.`;
    for (const [from, toMap] of this.rules) {
      if (from.startsWith(prefix)) {
        this.rules.delete(from);
        continue;
      }
      for (const to of toMap.keys()) {
        if (to.startsWith(prefix)) {
          toMap.delete(to);
        }
      }
    }
  }
}
```

### 3.3 Resolver Registry — Async Data Fetching

The orchestration layer needs async resolvers. These are registered by plugins and orchestrated outside the synchronous engine.

```typescript
// src/solve-js/src/plugins/ResolverRegistry.ts

export interface IResolver {
  /** Unique name (namespace-qualified) */
  name: string;
  /** 
   * Resolve one or more identifiers to Values.
   * Called by the orchestration layer, NOT by the engine directly.
   */
  resolve(identifiers: string[]): Promise<Map<string, unknown>>;
}

export class ResolverRegistry {
  private resolvers = new Map<string, IResolver>();

  register(resolver: IResolver): void {
    this.resolvers.set(resolver.name, resolver);
  }

  get(name: string): IResolver | undefined {
    return this.resolvers.get(name);
  }

  /** 
   * Batch-resolve identifiers across all registered resolvers.
   * Deduplicates identifiers. Returns merged results.
   */
  async resolveAll(identifiers: string[]): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();
    const deduped = [...new Set(identifiers)];
    if (deduped.length === 0) return results;

    await Promise.all(
      Array.from(this.resolvers.values()).map(async (resolver) => {
        try {
          const resolved = await resolver.resolve(deduped);
          for (const [key, value] of resolved) {
            results.set(key, value);
          }
        } catch (err) {
          // Log but don't fail — other resolvers may succeed
          console.warn(`Resolver "${resolver.name}" failed:`, err);
        }
      })
    );

    return results;
  }

  unregisterNamespace(namespace: string): void {
    const prefix = `${namespace}.`;
    for (const name of this.resolvers.keys()) {
      if (name.startsWith(prefix)) {
        this.resolvers.delete(name);
      }
    }
  }
}
```

### 3.4 Multi-Word Phrase Normalization

The Lexer already has a phrase trie (`PhraseTrieNode`) and `LexerPlugin.phrases`. The gap is:

1. Phrases are only matched in the lexer's `tokenizeIdentifier()` — they work for `price of` but not `Iron Axe`
2. There's no mechanism for plugins to register **arbitrary multi-word entities** that should be treated as a single item

**Proposed:** Extend the phrase system to support "noun phrase" merging — a post-lexer pass that merges adjacent `IDENT` tokens into `PHRASE` tokens when they match a plugin-registered vocabulary.

```typescript
// src/solve-js/src/lexer/PhraseNormalizer.ts

export interface PhraseVocabulary {
  /** Namespace-qualified */
  namespace: string;
  /** 
   * Vocabulary entries — longest-match priority.
   * e.g., { "iron axe": "item", "dragon hide": "item" } 
   */
  phrases: Record<string, string>;
  /** Token type emitted for matched phrases (default: "PHRASE") */
  tokenType?: string;
}

export class PhraseNormalizer {
  private vocabs = new Map<string, PhraseVocabulary>();
  // Trie keyed on first-word → PhraseTrieNode
  private trie: Map<string, PhraseTrieNode> = new Map();

  register(vocab: PhraseVocabulary): void {
    this.vocabs.set(vocab.namespace, vocab);
    for (const [phrase, _type] of Object.entries(vocab.phrases)) {
      const words = phrase.split(' ');
      const firstWord = words[0].toLowerCase();
      // Build into existing phrase trie structure
      // ... (uses same pattern as ExpressionLexer.buildPhraseTrie)
    }
  }

  /**
   * Post-lexer pass: merge adjacent IDENT tokens into PHRASE tokens.
   * Operates on Token[], modifies in place.
   * O(tokens × maxPhraseWords) — bounded by vocabulary depth.
   */
  normalize(tokens: Token[]): Token[] {
    if (this.vocabs.size === 0) return tokens;
    // Walk through tokens, greedily match the longest phrase starting at
    // each IDENT token using the trie. Replace matched spans with PHRASE tokens.
    // ...
    return tokens;
  }

  unregister(namespace: string): void {
    this.vocabs.delete(namespace);
    // Rebuild trie from remaining vocabs
  }
}
```

**Integration point:** The normalizer runs between `scanDocument()` tokenization and the parser. It's an optional pass — zero overhead when no phrase vocabs are registered.

---

## 4. Domain API — `registerDomain()` (Levels 1 & 2)

This is the primary plugin entry point for Levels 1 and 2. Plugin authors declare what their domain
looks like, and the engine auto-generates all the plumbing. Every field is optional — use only what
you need.

```typescript
// src/solve-js/src/plugins/DomainRegistry.ts

export interface DomainSpec {
  /** Unique namespace (e.g., "osrs", "crypto") */
  namespace: string;
  /** Semantic version */
  version: string;

  /** Value types defined by this domain */
  types?: Array<{
    name: string;
    extends?: string;  // parent type for coercion
    formatter?: (value: unknown) => string;
  }>;

  /** Arithmetic operators between domain types */
  operators?: Array<{
    op: '+' | '-' | '*' | '/' | '^' | '%' | 'in' | 'of' | 'per';
    lhs: string;
    rhs: string;
    returns: string;
    /** Name of a registered coercion function or inline logic */
    via?: string;
    /** Inline coercion: convert lhs to X, then use standard arithmetic */
    coerceLhs?: string;
    coerceRhs?: string;
  }>;

  /** Coercion/conversion rules */
  coercions?: Array<{
    from: string;
    to: string;
    /** Named resolver or inline convert function */
    via: string;
  }>;

  /** Keywords → token types (single words) */
  keywords?: Record<string, string>;

  /** Multi-word phrases → token types */
  phrases?: Record<string, string>;

  /** Multi-word entity vocabulary (noun phrases like "Iron Axe") */
  vocabulary?: Record<string, string>;

  /** Async resolvers */
  resolvers?: Record<string, (identifiers: string[]) => Promise<Map<string, unknown>>>;
}

export class DomainRegistry {
  private domains = new Map<string, DomainSpec>();

  register(spec: DomainSpec): void {
    this.domains.set(spec.namespace, spec);

    // 1. Register value types
    if (spec.types) {
      for (const t of spec.types) {
        ValueTypeRegistry.register(spec.namespace, t.name, {
          formatter: t.formatter,
        });
      }
    }

    // 2. Register coercions
    if (spec.coercions) {
      for (const c of spec.coercions) {
        // Register with CoercionRegistry
        // Auto-generate convert function from `via` name
      }
    }

    // 3. Register operators → auto-generate parselets
    if (spec.operators) {
      for (const op of spec.operators) {
        // Auto-generate infix parselet with type-checked coercion
        // e.g., "item + item in gp" → parse both as items, coerce to number,
        // add, then coerce result to gp
      }
    }

    // 4. Register lexer keywords and phrases
    if (spec.keywords || spec.phrases) {
      sharedLexer.registerPlugin({
        keywords: spec.keywords,
        phrases: spec.phrases ? Object.entries(spec.phrases).map(
          ([phrase, type]) => ({ phrase, type })
        ) : undefined,
      });
    }

    // 5. Register vocabulary for phrase normalization
    if (spec.vocabulary) {
      phraseNormalizer.register({
        namespace: spec.namespace,
        phrases: spec.vocabulary,
      });
    }

    // 6. Register async resolvers
    if (spec.resolvers) {
      for (const [name, fn] of Object.entries(spec.resolvers)) {
        resolverRegistry.register({
          name: `${spec.namespace}.${name}`,
          resolve: fn,
        });
      }
    }
  }

  unregister(namespace: string): void {
    this.domains.delete(namespace);
    ValueTypeRegistry.unregisterNamespace(namespace);
    CoercionRegistry.unregisterNamespace(namespace);
    phraseNormalizer.unregister(namespace);
    resolverRegistry.unregisterNamespace(namespace);
    // Note: operator parselets are harder to unregister individually —
    // for now, unregistration clears the bytecode cache and forces re-parse
  }
}
```

### Level 2 Example — OSRS with Custom Arithmetic

```typescript
// Hypothetical external plugin: solve-osrs
import { solve } from 'solve-js';

export const osrsDomain: DomainSpec = {
  namespace: 'osrs',
  version: '1.0.0',

  types: [
    { name: 'gp', extends: 'number' },
    { name: 'item', extends: undefined },
  ],

  operators: [
    { op: '+', lhs: 'osrs.item', rhs: 'osrs.item', returns: 'number',
      coerceLhs: 'number', coerceRhs: 'number', via: 'osrs.resolvePrice' },
    { op: 'in', lhs: 'number', rhs: 'osrs.gp', returns: 'osrs.gp' },
  ],

  coercions: [
    { from: 'osrs.item', to: 'number', via: 'osrs.resolvePrice' },
  ],

  keywords: {
    'gp': 'osrs.gp',
  },

  vocabulary: {
    'iron axe': 'item', 'dragon hide': 'item',
    'rune scimitar': 'item', 'obby cape': 'item',
  },

  phrases: {
    'price of': 'PRICE_OF',
    'value of': 'PRICE_OF',
  },

  resolvers: {
    resolvePrice: async (items) => {
      const prices = await fetch(`https://api.osrs.com/prices?items=${items.join(',')}`);
      const data = await prices.json();
      return new Map(data.prices.map((p: any) => [p.item, p.price]));
    },
  },
};

// Registration:
solve.registerDomain(osrsDomain);
```

---

## 5. Orchestration Layer — Async Resolution Pipeline

The engine stays synchronous. The orchestration layer handles async work.

```
Input: "Iron Axe + Dragon Hide in gp"

┌─────────────────────────────────────────────────┐
│ Phase 1: Tokenize (synchronous, in-engine)      │
│ "Iron Axe" → [IDENT, IDENT]                    │
│                                                │
│ Phase 2: Normalize (synchronous, in-engine)    │
│ [IDENT, IDENT] → [PHRASE("Iron Axe", "item")]  │
│                                                │
│ Phase 3: Parse (synchronous, in-engine)        │
│ PHRASE + PHRASE + IN + UNIT("gp")              │
│ → AST: BinaryIn(Add(ItemRef, ItemRef), UnitRef)│
│                                                │
│ Phase 4: Collect unresolved identifiers        │
│ Walk AST → ["Iron Axe", "Dragon Hide"]          │
│                                                │
│ Phase 5: Resolve (async, in-orchestrator)      │
│ resolver.resolve(["Iron Axe", "Dragon Hide"])  │
│ → Map { "Iron Axe": 5000, "Dragon Hide": 3000 }│
│                                                │
│ Phase 6: Substitute & Execute (sync, in-engine) │
│ Replace PHRASE tokens with NUMBER tokens        │
│ → "5000 + 3000 in gp" → engine.evaluate() → 8000│
└─────────────────────────────────────────────────┘
```

```typescript
// src/solve-js/src/orchestration/Orchestrator.ts

export class Orchestrator {
  constructor(
    private engine: ExpressionEngine,
    private normalizer: PhraseNormalizer,
    private resolverRegistry: ResolverRegistry,
  ) {}

  /**
   * Full async pipeline: tokenize → normalize → parse → resolve → substitute → evaluate.
   */
  async evaluate(input: string): Promise<Value> {
    // 1-3: Tokenize + Normalize + Parse (synchronous)
    const tokens = this.engine.getLexer().tokenizeAll(input);
    const normalized = this.normalizer.normalize(tokens);
    const { reads } = this.engine.compileExpression(input);

    // 4: Collect unresolved identifiers
    const unresolved = this.collectUnresolved(normalized, reads);

    // 5: Resolve asynchronously
    if (unresolved.length > 0) {
      const resolved = await this.resolverRegistry.resolveAll(unresolved);

      // 6: Substitute resolved values into the expression
      const substituted = this.substitute(normalized, resolved);
      return this.engine.evaluateLineWithTokens(-1, substituted);
    }

    // No unresolved identifiers — evaluate directly
    return this.engine.evaluateExpression(input);
  }

  private collectUnresolved(tokens: Token[], reads: string[]): string[] {
    // Return identifiers that are neither variables nor keywords
    // ...
    return [];
  }

  private substitute(tokens: Token[], resolved: Map<string, unknown>): Token[] {
    // Replace PHRASE tokens with NUMBER tokens containing resolved values
    // ...
    return tokens;
  }
}
```

### Integration with ExpressionEngine

The orchestrator wraps the engine. It does NOT replace it. For expressions without async dependencies (99%+ of keystrokes), the engine's fast path is unchanged:

```typescript
// Fast path — no orchestration overhead
const result = engine.evaluateExpression("1 + 2 * 3");

// Slow path — only when plugin domains are active
const result = await orchestrator.evaluate("Iron Axe + Dragon Hide in gp");
```

---

## 6. Level 3 API — Parselet-Level Access

This is what already exists — `ISolvePackage`, `SolvePlugin`, `ParseletRegistry`. Level 3 is the
escape hatch for the ~2% of plugins that need control the declarative API can't express.

**Current state assessment:**

| Feature | Status | API |
|---------|--------|-----|
| Register prefix parselets | ✅ | `registry.registerPrefix(tokenType, parselet)` |
| Register infix parselets | ✅ | `registry.registerInfix(tokenType, parselet)` |
| Register opcode handlers | ✅ | `sharedOpRegistry.register(registration)` |
| Register variable sources | ✅ | `sharedVariableResolver.registerSource(source)` |
| Register lexer tokens | ✅ | `sharedLexer.registerPlugin(plugin)` |
| Bulk registration | ✅ | `ISolvePackage` / `registerPackage()` |
| Plugin lifecycle | ✅ | `SolvePlugin` / `PluginManager` |
| Plugin introspection | 🟡 | `PluginManager.getPlugins()` — works, no metadata API |
| Plugin settings | 🟡 | `PluginConfig` / `PluginRegistry` — exists but unused |
| Plugin discovery | 🔴 | `PluginDiscovery` — stub only |
| Plugin namespace isolation | 🔴 | No scoping — plugin A's `gp` collides with plugin B's `gp` |

**What Level 3 needs:**

1. **Namespace scoping:** Every plugin registration is tagged with a namespace. Prefix parselets registered as `osrs.PHRASE` are distinct from `crypto.PHRASE`. Unregistration clears only that namespace.
2. **Plugin metadata introspection:** `PluginManager.describe()` returns type/operator/coercion metadata for UI display.
3. **Plugin settings API:** Standardized `ISolvePlugin.settings` → `SettingsTab` integration for Obsidian's settings UI.
4. **Discovery:** `PluginDiscovery.scanDirectory()` for file-system based plugin loading (Obsidian community plugins pattern).

---

## 7. Namespace Isolation

The critical design problem: "If plugin A registers `gp` as a keyword and plugin B also registers `gp`, they collide." Solution:

### 7.1 Scoped Registries

```typescript
// Each domain gets its own scoped registries that forward to shared ones with
// namespace-qualified token types.
export class ScopedRegistry {
  constructor(private namespace: string, private shared: ParseletRegistry) {}

  registerPrefix(tokenType: string, parselet: PrefixParselet): void {
    this.shared.registerPrefix(`${this.namespace}.${tokenType}`, parselet);
  }

  registerInfix(tokenType: string, parselet: InfixParselet): void {
    this.shared.registerInfix(`${this.namespace}.${tokenType}`, parselet);
  }
}
```

### 7.2 Namespace Precedence

When multiple domains register the same keyword, the **most recently registered** wins (LIFO). A `priority` field on `DomainSpec` lets plugins declare precedence explicitly:

```typescript
export interface DomainSpec {
  namespace: string;
  priority?: number; // Higher = takes precedence. Default: 0
  // ...
}
```

### 7.3 Lexer Namespace Resolution

The lexer's `tokenizeIdentifier()` already checks `mergedKeywords` (locale → plugin). We extend this to check a priority-sorted list of domain keyword maps:

```
locale keywordMap (highest priority)
  → domain keywords by priority (descending)
  → knownUnits
  → IDENT (fallback)
```

---

## 8. Implementation Phases

### Phase 0: Level 0 — Keyword/Macro Provider (new)

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| 00 | `registerConstant(name, value)` — wrapper creates anonymous Level 1 domain | `src/solve-js/src/plugins/DomainRegistry.ts` | ~30 |
| 01 | `registerMacro(pattern, resolver)` — regex/string pattern → value function | `src/solve-js/src/plugins/DomainRegistry.ts` | ~50 |
| 02 | Expose via `SolveAPI.registerConstant()` / `SolveAPI.registerMacro()` | `src/solve-js/src/api/SolveAPI.ts` | +15 |
| 03 | Tests — "Current time", "pi", "sqrt(16)", "roll 2d6", "rand" | `src/solve-js/__tests__/plugins/` | ~150 |

### Phase A: Foundation (Value Types + Coercion + Resolvers)

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| A1 | `ValueTypeRegistry` — dynamic type IDs ≥ 100 | `src/solve-js/src/vm/ValueTypeRegistry.ts` | ~60 |
| A2 | `Value` — add `customType`, `customValue` fields | `src/solve-js/src/vm/Value.ts` | +15 |
| A3 | `CoercionRegistry` — from→to→convert map | `src/solve-js/src/vm/CoercionRegistry.ts` | ~80 |
| A4 | `ResolverRegistry` — named async resolvers | `src/solve-js/src/plugins/ResolverRegistry.ts` | ~70 |
| A5 | Wire registries into `ExpressionEngine` constructor | `src/solve-js/src/engine/ExpressionEngine.ts` | +20 |
| A6 | Unit tests for all three registries | `src/solve-js/__tests__/plugins/` | ~200 |

### Phase B: Phrase Normalization

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| B1 | `PhraseNormalizer` class — trie-based IDENT merging | `src/solve-js/src/lexer/PhraseNormalizer.ts` | ~120 |
| B2 | Integrate into `ExpressionEngine.evaluateWithTokens()` | `src/solve-js/src/engine/ExpressionEngine.ts` | +5 |
| B3 | Lexer phrase trie supports PHRASE token type | `src/solve-js/src/lexer/ExpressionLexer.ts` | +20 |
| B4 | Tests — "Iron Axe + Dragon Hide" normalizes | `src/solve-js/__tests__/lexer/` | ~150 |

### Phase C: DomainRegistry (Level 1+2 API)

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| C1 | `DomainSpec` type + `DomainRegistry.register()` | `src/solve-js/src/plugins/DomainRegistry.ts` | ~200 |
| C2 | Auto-generate parselets from operator declarations | `src/solve-js/src/plugins/DomainRegistry.ts` | ~100 |
| C3 | Auto-generate coercions from coercion declarations | `src/solve-js/src/plugins/DomainRegistry.ts` | ~60 |
| C4 | `DomainRegistry.unregister()` — clean teardown | `src/solve-js/src/plugins/DomainRegistry.ts` | ~50 |
| C5 | Expose via `SolveAPI.registerDomain()` | `src/solve-js/src/api/SolveAPI.ts` | +15 |
| C6 | Tests — mini OSRS domain integration test | `src/solve-js/__tests__/plugins/` | ~300 |

### Phase D: Orchestration Layer

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| D1 | `Orchestrator` class — async pipeline wrapper | `src/solve-js/src/orchestration/Orchestrator.ts` | ~150 |
| D2 | AST walker for unresolved identifier collection | `src/solve-js/src/orchestration/Orchestrator.ts` | ~50 |
| D3 | Token substitution (PHRASE → NUMBER) | `src/solve-js/src/orchestration/Orchestrator.ts` | ~60 |
| D4 | Integration test — full OSRS async pipeline | `src/solve-js/__tests__/orchestration/` | ~200 |

### Phase E: Namespace Isolation + External API Polish

| # | Task | Files | Lines |
|---|------|-------|:-----:|
| E1 | `ScopedRegistry` — namespace-qualified registrations | `src/solve-js/src/plugins/ScopedRegistry.ts` | ~50 |
| E2 | Lexer namespace precedence resolution | `src/solve-js/src/lexer/ExpressionLexer.ts` | +30 |
| E3 | `SolveAPI` — stable external interface (no internal types exposed) | `src/solve-js/src/api/SolveAPI.ts` | +40 |
| E4 | Plugin metadata introspection (`PluginManager.describe()`) | `src/solve-js/src/plugins/PluginSystem.ts` | +30 |
| E5 | Plugin settings → Obsidian SettingsTab bridge | `src/solve-js/src/plugins/PluginSettingsBridge.ts` | ~60 |

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| **Value type explosion** — plugins create too many types, bloating VM dispatch | Hard cap: 64 custom types per engine instance. VM uses `Uint8Array` for type ID. Reject registration beyond cap. |
| **Coercion chains** — A→B→C chains cause unbounded conversion overhead | Max coercion depth: 3. Flatten transitive closures at registration time. |
| **Async resolver timeouts** — external API calls stall the pipeline | 5-second timeout per resolver. On timeout, substitute NaN and continue. |
| **Phrase normalizer performance** — O(tokens × vocab-depth) could be expensive | Only run when `PhraseNormalizer` has registered vocabs. Bypass check is O(1): `if (!this.hasPhrases) return tokens;` |
| **Namespace collision** — two plugins register `gp` | Priority system (explicit priority + LIFO tiebreaker). First-registered wins unless later plugin declares higher priority. Conflicts logged at registration time. |
| **Macro pattern explosion** — regex-based macros evaluated on every keystroke | Regex patterns are compiled once at registration. Pattern matching is O(n) where n = registered macros. Cap: 200 macros. Measure and warn if macro resolve time > 100μs. |
| **Breaking existing fast path** — orchestrator slows down non-plugin expressions | Orchestrator is a separate wrapper. `engine.evaluateExpression()` is unchanged. Only expressions with domain-typed results pass through the orchestrator. |

---

## 10. What NOT to Do

- ❌ **Don't make the engine async.** The synchronous fast path is sacred. Async is strictly in the orchestrator.
- ❌ **Don't replace the existing `Value` type system.** Plugin types are additive, not replacement. Core types (Number, String, etc.) are immutable.
- ❌ **Don't require plugins to write parselets for common patterns.** If 90% of domain operators are binary infix with type coercions, auto-generate them from declarations.
- ❌ **Don't expose internal types (`OpCode`, `BytecodeBuilder`, `Parser`) in Level 0, 1, or 2 APIs.** Those are Level 3 escape-hatch only.
- ❌ **Don't implement plugin discovery until Phase E.** File-system scanning and npm resolution are complex and non-essential for the core architecture.
- ❌ **Don't make `registerMacro()` do things `registerDomain()` can't.** Level 0 is a convenience wrapper, not a separate engine code path.

---

## 11. Success Criteria

1. **Level 0 — one-liner plugins:** `solve.registerMacro('Current time', () => new Date().toISOString())` works. A plugin author can add a custom keyword in a single line of code.
2. **Level 1 — vocabulary domains:** `solve.registerDomain({ namespace, vocabulary, keywords, resolvers })` enables `Iron Axe in gp` with async price resolution.
3. **Level 2 — custom arithmetic:** Same `registerDomain()` with `operators`/`coercions` fields enables `Iron Axe + Dragon Hide` to sum correctly.
4. **Level 3 — full control:** `registerPrefixParselet()` / `registerInfixParselet()` / `registerOpcodeHandler()` for custom syntax that can't be expressed declaratively.
5. **Existing benchmarks** show zero regression — the orchestrator is bypassed for non-plugin expressions.
6. **Plugin unload** fully cleans up: all parselets, opcodes, keywords, phrases, resolvers, macros, and coercions removed.
7. **Namespace isolation** — two plugins can both register `gp` without conflict (priority decides winner).
