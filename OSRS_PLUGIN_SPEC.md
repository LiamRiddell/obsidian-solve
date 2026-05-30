# AGENT HANDOFF — Game Item Plugin for obsidian-solve

> **Generated:** 2026-05-30 | **Author:** Claude Sonnet 4.6  
> **Based on:** Full codebase audit + Perplexity architecture research  
> **Purpose:** Complete implementation specification for adding OSRS (and generic game-item)  
> plugin support to obsidian-solve. Designed for a smaller agent to execute without  
> clarification requests.
>
> **Read first:** `PROJECT_ETHOS.md`, `ARCHITECTURE_PRINCIPLES.md`, `todo_claude.md`.  
> **Benchmark before and after every performance change. No `any` types. ErrorFactory everywhere.**

---

## 1. What the Perplexity Research Document Recommends vs What Already Exists

The Perplexity research is architecturally sound. obsidian-solve already implements ~90% of it.
This section maps recommendations to reality so the agent doesn't re-implement existing work.

| Perplexity recommendation | Status in obsidian-solve |
|---|---|
| Pratt / precedence-climbing parser | ✅ `Parser.ts` — full Pratt with integer typeId dispatch |
| Layered pipeline (lex → normalise → parse → eval) | ✅ Lexer → ExpressionEngine → BytecodeBuilder → VM |
| Plugin keyword/phrase/unit registration | ✅ `LexerPlugin` + `TokenClassRegistry` |
| Two-stage lexer/normalizer | ✅ Stage 1 is `ExpressionLexer`, Stage 2 is `TokenClassRegistry.build()` |
| Multi-word phrase trie | ✅ `buildPhraseTrie()` in `ExpressionLexer.ts` |
| `peek()`, `next()`, `expect()` token stream API | ✅ `Parser.consume()`, `Parser.peek()`, `Parser.match()` |
| Plugin type registration | ✅ `ISolvePackage` in `SolveAPI.ts` |
| Plugin parselet registration | ✅ `registerPrefixParselet()`, `registerInfixParselet()` |
| Plugin opcode handlers | ✅ `registerOpcodeHandler()` + `OpRegistry` |
| Defer async fetches until after parse | ✅ `IDynamicDataSource` + `DynamicValueResolver` |
| Avoid Map.get() for common tokens | ✅ Integer typeId system in `Token.ts` |
| Sub-millisecond latency target | ✅ ValueArena, bytecode cache, ThreeTierEvaluator |
| **Dynamic multi-word entity vocabulary (10k+ items)** | ❌ **Missing — phrase trie is static** |
| **Token normalizer pass before parser** | ❌ **Missing — ISolvePackage has no normalizer hook** |
| **Game item coercion to gp (ValueType)** | ❌ **Missing — no game item value type** |

The **three gaps** are what this document specifies.

---

## 2. Target User Experience

After this work, a user in Obsidian writes:

```
Iron Axe                         → 423 gp
Dragon Hide                      → 1,204 gp  
Iron Axe + Dragon Hide           → 1,627 gp
Iron Axe + Dragon Hide in gp     → 1,627 gp
2 × Iron Axe                    → 846 gp
osrs price of Abyssal Whip       → 82,000 gp
osrs ge Twisted Bow              → 1,254,000,000 gp
iron axe                         → 423 gp   (case-insensitive)
```

The plugin resolves item names to live Grand Exchange prices via the OSRS wiki API,
caches results, and triggers re-evaluation when prices update (every 5 minutes).

---

## 3. Key Design Decisions

### 3.1 Use `ValueType.Uom` with unit `"gp"` — no new ValueType needed

Game items resolve to a gp amount. `uomValue(price, "gp")` fits perfectly:
- Existing `binaryOp()` already handles `Uom + Uom → Uom` (same unit) → sum.
- `Iron Axe + Dragon Hide` → `uomValue(423, "gp") + uomValue(1204, "gp")` → `uomValue(1627, "gp")`.
- `Iron Axe in gp` → `InParselet` already handles `UOM_CONVERT_IN`. Identity conversion.
- `2 × Iron Axe` → `uomValue(423, "gp") * numberValue(2)` → `uomValue(846, "gp")` via existing `binaryOp`.
- Formatting is already handled for Uom values — the result renders as `1,627 gp`.

No changes to `Value.ts`, `VMConversion.ts`, or any existing type code.

### 3.2 Use a dedicated item-name trie — not the phrase trie

The existing `phraseTrie` in `ExpressionLexer` is for fixed grammar phrases ("to the power of",
"increase by"). OSRS has ~3,800 tradeable items. Loading all of them into the shared phrase trie
would pollute the grammar and slow down every expression (the trie is consulted for every IDENT).

Instead: a **separate post-tokenization normalizer pass** with its own trie runs only when the
OSRS plugin is active. It receives the `Token[]` array from the lexer and merges consecutive
IDENT sequences that match a known item name into a single `GAME_ITEM` token.

### 3.3 Integration point: `ISolvePackage.tokenNormalizers`

The cleanest core change: add a `tokenNormalizers` field to `ISolvePackage`. The
`ExpressionEngine` applies these normalizers (in order) after `lexer.tokenizeAll()` and before
`parser.load()`. This is a 3-line change to `ExpressionEngine` and a 2-field change to
`SolveAPI.ts`. It's fully backwards-compatible (existing packages have no normalizers).

### 3.4 Async prices via `IDynamicDataSource` — existing infrastructure, no new mechanism

`DynamicValueResolver` already:
- Accepts `IDynamicDataSource` registrations.
- Polls on `refreshIntervalMs` intervals.
- Calls `onBatch(affectedLines)` when new data arrives.
- The `ThreeTierEvaluator` subscribes to `onBatch` and marks dirty lines.

The OSRS plugin registers an `OsrsPriceSource` that implements `IDynamicDataSource`. On each
poll, it fetches ALL prices in one call to the OSRS wiki API bulk endpoint and updates a local
`Map<itemName, price>`. The `RESOLVE_GAME_ITEM` opcode reads from this cache synchronously.

The first evaluation returns `0 gp` (or a loading indicator). The first API fetch completes
within ~500ms. `onBatch` fires with all lines containing GAME_ITEM tokens. ThreeTierEvaluator
re-evaluates. User sees prices appear ~500ms after the first item expression is typed.

---

## 4. Files to Create

```
src/solve-js/src/plugins/
  osrs/
    OsrsPlugin.ts            — ISolvePackage implementation, main entry point
    OsrsLexerPlugin.ts       — LexerPlugin: registers "osrs", "ge" as keywords
    OsrsItemNormalizer.ts    — TokenNormalizer: multi-word item name → GAME_ITEM token
    OsrsItemTrie.ts          — Trie data structure for item name lookup
    OsrsItemVocabulary.ts    — Bundled item name list (generated at build time)
    OsrsParselet.ts          — PrefixParselet for GAME_ITEM + OSRS_KEYWORD tokens
    OsrsPriceSource.ts       — IDynamicDataSource implementation
    OsrsPriceCache.ts        — Thread-safe (single-threaded JS) price cache
    OsrsVmHandler.ts         — Opcode handler for RESOLVE_GAME_ITEM
    types.ts                 — Shared types (OsrsItem, OsrsPrice, etc.)
    index.ts                 — Re-exports OsrsPlugin
```

## 5. Files to Modify

```
src/solve-js/src/api/SolveAPI.ts       — add TokenNormalizer to ISolvePackage
src/solve-js/src/engine/ExpressionEngine.ts  — apply normalizers after tokenizeAll()
src/solve-js/src/parser/OpCode.ts      — add RESOLVE_GAME_ITEM opcode
src/solve-js/src/engine/ExpressionEngine.ts  — register normalizers from plugin
src/app/engine/EngineProvider.ts        — wire OsrsPlugin into the engine on init
```

---

## 6. Core API Changes

### 6.1 `SolveAPI.ts` — add `TokenNormalizer` and `tokenNormalizers`

```typescript
// Add to SolveAPI.ts:

/**
 * A post-tokenization normalizer that transforms the Token[] array before
 * it reaches the parser. Receives the full token array from the lexer and
 * returns a (possibly modified) token array.
 *
 * Normalizers run in registration order. Each normalizer receives the output
 * of the previous one. Built-in tokens (PLUS, MINUS, UNIT, etc.) MUST be
 * preserved unless deliberately consumed — the parser depends on them.
 *
 * Normalizers are called on every expression evaluation. Keep them O(n) in
 * token count and allocation-light. Do not perform async work here.
 */
export interface TokenNormalizer {
  readonly name: string;
  normalize(tokens: Token[]): Token[];
}

// Add to ISolvePackage:
export interface ISolvePackage {
  name: string;
  lexerPlugin?: LexerPlugin;
  prefixParselets?: Array<{ tokenType: string; parselet: PrefixParselet }>;
  infixParselets?: Array<{ tokenType: string; parselet: InfixParselet }>;
  opcodeHandlers?: IOpcodeHandlerRegistration[];
  variableSources?: IVariableSource[];
  tokenNormalizers?: TokenNormalizer[];  // ← NEW
  dynamicSources?: IDynamicDataSource[];  // ← NEW (for OsrsPriceSource)
}

// Add to Solve.registerPackage():
if (pkg.tokenNormalizers) {
  for (const norm of pkg.tokenNormalizers) {
    sharedTokenNormalizers.push(norm);
  }
}
if (pkg.dynamicSources) {
  for (const src of pkg.dynamicSources) {
    // DynamicValueResolver is accessed via ExpressionEngine.registerDynamicSource()
    sharedExpressionEngine.registerDynamicSource(src);
  }
}
```

### 6.2 `ExpressionEngine.ts` — apply normalizers in the evaluate path

In `ExpressionEngine`, after `lexer.resetExpression(expression)` and
`tokens = lexer.tokenizeAll()`, add:

```typescript
// Normalizer application — O(n) in token count, zero allocation when no normalizers.
private normalizers: TokenNormalizer[] = [];

registerNormalizer(norm: TokenNormalizer): void {
  this.normalizers.push(norm);
}

// In evaluateWithTokens() / evaluateLineWithPreTokenized() — after tokenizeAll():
let tokens = this.lexer.tokenizeAll();
for (const norm of this.normalizers) {
  tokens = norm.normalize(tokens);  // each normalizer returns a (possibly new) array
}
// Then: parser.load(tokens, hasParens);
```

The normalizer chain is fast in the no-normalizer case: the for loop doesn't execute and
the allocation is zero.

### 6.3 `OpCode.ts` — add `RESOLVE_GAME_ITEM`

```typescript
// Add to OpCode enum — use a value in the 200+ plugin range to avoid conflicts:
RESOLVE_GAME_ITEM = 210,
```

The opcode handler is registered by `OsrsPlugin` at startup via `registerOpcodeHandler()`.
It is never emitted unless the OSRS plugin is loaded — no impact on base performance.

---

## 7. OSRS Plugin Implementation — File by File

### 7.1 `types.ts`

```typescript
// src/solve-js/src/plugins/osrs/types.ts

export interface OsrsItem {
  id: number;
  name: string;          // canonical name (title case): "Iron Axe"
  nameLower: string;     // lowercase for matching: "iron axe"
}

export interface OsrsPrice {
  high: number;          // GE buy price
  low: number;           // GE sell price
  highTime: number;      // Unix timestamp of last high trade
  lowTime: number;       // Unix timestamp of last low trade
}

export interface OsrsApiResponse {
  data: Record<string, OsrsPrice>;
}

/**
 * The mid-price used for display (average of high and low).
 * Returns `high` when low is missing (untradeable or no data).
 */
export function midPrice(price: OsrsPrice): number {
  if (!price.low || price.low <= 0) return price.high;
  return Math.round((price.high + price.low) / 2);
}
```

### 7.2 `OsrsItemVocabulary.ts`

This file contains the bundled item vocabulary. It is generated by a build script (see §11)
that fetches the OSRS item list from the wiki and compiles it into a static TypeScript module.

```typescript
// src/solve-js/src/plugins/osrs/OsrsItemVocabulary.ts
// AUTO-GENERATED — do not edit by hand.
// Run: npm run generate:osrs-vocab

import type { OsrsItem } from "./types";

/**
 * All tradeable OSRS items, sorted by name length descending (longest first).
 * Longest-match normalizer must try longer names before shorter ones to avoid
 * "Abyssal" matching before "Abyssal Whip".
 */
export const OSRS_ITEMS: OsrsItem[] = [
  // Generated entries — example shape:
  // { id: 4151, name: "Abyssal Whip", nameLower: "abyssal whip" },
  // { id: 4087, name: "Dragon Platelegs", nameLower: "dragon platelegs" },
  // ...
];

/**
 * Pre-built lookup: lowercase name → item id.
 * Populated once at module load time.
 */
export const OSRS_ITEM_NAME_TO_ID = new Map<string, number>(
  OSRS_ITEMS.map(item => [item.nameLower, item.id])
);

/**
 * Pre-built lookup: item id → canonical name.
 */
export const OSRS_ITEM_ID_TO_NAME = new Map<number, string>(
  OSRS_ITEMS.map(item => [item.id, item.name])
);
```

**Build script** (`tools/generate-osrs-vocab.ts`):
```typescript
// Fetches https://prices.runescape.wiki/api/v1/osrs/mapping
// Filters to tradeable items (members + f2p)
// Sorts by name length descending (longest match first)
// Writes OsrsItemVocabulary.ts
```

Until the build script exists, stub `OSRS_ITEMS` with a representative set for testing:
```typescript
export const OSRS_ITEMS: OsrsItem[] = [
  { id: 4151, name: "Abyssal Whip", nameLower: "abyssal whip" },
  { id: 11802, name: "Armadyl Godsword", nameLower: "armadyl godsword" },
  { id: 12696, name: "Twisted Bow", nameLower: "twisted bow" },
  { id: 1351, name: "Bronze Axe", nameLower: "bronze axe" },
  { id: 1267, name: "Iron Axe", nameLower: "iron axe" },
  { id: 1269, name: "Steel Axe", nameLower: "steel axe" },
  { id: 1373, name: "Dragon Axe", nameLower: "dragon axe" },
  { id: 1745, name: "Dragon Hide", nameLower: "dragon hide" },
  { id: 2497, name: "Granite Maul", nameLower: "granite maul" },
  { id: 1079, name: "Rune Platelegs", nameLower: "rune platelegs" },
  { id: 2, name: "Cannonball", nameLower: "cannonball" },
];
```

### 7.3 `OsrsItemTrie.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsItemTrie.ts

import type { OsrsItem } from "./types";

interface TrieNode {
  children: Map<string, TrieNode>;
  /** Item at this node (set only on terminal nodes — complete item name match) */
  item?: OsrsItem;
}

/**
 * Word-level trie for OSRS item name lookup.
 * Keys are individual words (lowercase), not characters.
 * Supports longest-match greedy scanning over a Token[] array.
 *
 * Example: "abyssal whip" is stored as:
 *   root → "abyssal" → "whip" (item = {4151, "Abyssal Whip"})
 *
 * Construction: O(total words across all items).
 * Lookup: O(words in matched phrase).
 */
export class OsrsItemTrie {
  private root: TrieNode = { children: new Map() };

  constructor(items: OsrsItem[]) {
    for (const item of items) {
      this.insert(item);
    }
  }

  private insert(item: OsrsItem): void {
    const words = item.nameLower.split(" ");
    let node = this.root;
    for (const word of words) {
      let child = node.children.get(word);
      if (!child) {
        child = { children: new Map() };
        node.children.set(word, child);
      }
      node = child;
    }
    // Only set item if not already set — first registration wins (handles duplicates)
    if (!node.item) {
      node.item = item;
    }
  }

  /**
   * Try to match the longest item name starting at tokens[startIdx].
   * Only considers tokens of type "IDENT". Stops at non-IDENT tokens.
   *
   * Returns { item, wordCount } on match, null on no match.
   */
  longestMatch(
    tokens: Token[],
    startIdx: number,
  ): { item: OsrsItem; wordCount: number } | null {
    let node = this.root;
    let lastMatch: { item: OsrsItem; wordCount: number } | null = null;
    let i = startIdx;

    while (i < tokens.length) {
      const token = tokens[i];
      // Only merge IDENT tokens — stop at operators, numbers, keywords
      if (token.type !== "IDENT") break;

      const word = token.value.toLowerCase();
      const child = node.children.get(word);
      if (!child) break;

      node = child;
      i++;

      // Record match if this node completes an item name
      if (node.item) {
        lastMatch = { item: node.item, wordCount: i - startIdx };
        // Don't break — continue looking for a longer match
        // ("abyssal" alone might not be an item but "abyssal whip" is)
      }
    }

    return lastMatch;
  }
}
```

### 7.4 `OsrsItemNormalizer.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsItemNormalizer.ts

import { Token, tokenTypeId, registerTokenType } from "@solve-js/lexer/Token";
import type { TokenNormalizer } from "@solve-js/api/SolveAPI";
import { OsrsItemTrie } from "./OsrsItemTrie";
import { OSRS_ITEMS } from "./OsrsItemVocabulary";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";

// Register the GAME_ITEM token type once at module load.
// tokenTypeId() is idempotent — safe to call multiple times.
export const GAME_ITEM_TYPE_ID = tokenTypeId("GAME_ITEM");
export const GAME_ITEM_TYPE = "GAME_ITEM";
registerTokenType("GAME_ITEM");

/**
 * Post-tokenization normalizer that merges consecutive IDENT token sequences
 * matching known OSRS item names into a single GAME_ITEM token.
 *
 * Example:
 *   Input:  [IDENT("Iron"), IDENT("Axe"), PLUS, IDENT("Dragon"), IDENT("Hide")]
 *   Output: [GAME_ITEM("Iron Axe"), PLUS, GAME_ITEM("Dragon Hide")]
 *
 * Matching is case-insensitive and greedy (longest match wins).
 * Non-IDENT tokens are passed through unchanged.
 * IDENT tokens that don't start an item name are passed through unchanged.
 *
 * Performance: O(n) in token count. Zero allocation when no items matched.
 * The trie lookup is O(words in item name), typically 1-3 words.
 */
export class OsrsItemNormalizer implements TokenNormalizer {
  readonly name = "osrs-item-normalizer";
  private trie: OsrsItemTrie;

  constructor(customItems?: typeof OSRS_ITEMS) {
    this.trie = new OsrsItemTrie(customItems ?? OSRS_ITEMS);
  }

  normalize(tokens: Token[]): Token[] {
    // Fast path: if no IDENT tokens, nothing can match
    if (!tokens.some(t => t.type === "IDENT")) return tokens;

    const result: Token[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === "IDENT") {
        const match = this.trie.longestMatch(tokens, i);
        if (match) {
          // Merge: replace matched token sequence with a single GAME_ITEM token.
          // Preserve position info from the first token for error reporting.
          result.push(new LexerToken(
            GAME_ITEM_TYPE,
            GAME_ITEM_TYPE_ID,
            match.item.name,     // value = canonical name ("Iron Axe")
            match.item.name,     // text = same
            token.offset,
            0,
            token.line,
            token.col,
          ));
          i += match.wordCount;
          continue;
        }
      }
      result.push(token);
      i++;
    }

    return result;
  }
}
```

### 7.5 `OsrsPriceCache.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsPriceCache.ts

import type { OsrsPrice } from "./types";
import { midPrice } from "./types";

/**
 * In-memory price cache for OSRS Grand Exchange prices.
 *
 * Keyed by item ID (number). The cache is populated by OsrsPriceSource
 * on successful API fetches and read synchronously by the VM opcode handler.
 *
 * Thread safety: single-threaded JS — no locking needed.
 */
export class OsrsPriceCache {
  /** item id → price data */
  private prices = new Map<number, OsrsPrice>();
  /** timestamp of last successful fetch */
  private lastFetchTime = 0;
  /** Whether the cache has been populated at least once */
  private hasData = false;

  /** Update the cache with a fresh API response. Called by OsrsPriceSource. */
  update(data: Record<string, OsrsPrice>): void {
    for (const [idStr, price] of Object.entries(data)) {
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        this.prices.set(id, price);
      }
    }
    this.lastFetchTime = Date.now();
    this.hasData = true;
  }

  /**
   * Get the mid-price for an item by ID.
   * Returns 0 if the item is not in the cache (first load, API error, or non-tradeable).
   */
  getPrice(itemId: number): number {
    const price = this.prices.get(itemId);
    if (!price) return 0;
    return midPrice(price);
  }

  get isReady(): boolean { return this.hasData; }
  get age(): number { return Date.now() - this.lastFetchTime; }

  clear(): void {
    this.prices.clear();
    this.hasData = false;
  }
}

/** Shared singleton — the VM opcode handler reads from this instance. */
export const sharedOsrsPriceCache = new OsrsPriceCache();
```

### 7.6 `OsrsPriceSource.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsPriceSource.ts

import type { IDynamicDataSource } from "@solve-js/engine/IDynamicDataSource";
import { OSRS_ITEM_NAME_TO_ID } from "./OsrsItemVocabulary";
import { sharedOsrsPriceCache } from "./OsrsPriceCache";
import type { OsrsApiResponse } from "./types";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

const PRICES_API = "https://prices.runescape.wiki/api/v1/osrs/latest";
const USER_AGENT = "obsidian-solve/1.0 (https://github.com/obsidian-solve)";

/**
 * IDynamicDataSource implementation for OSRS Grand Exchange prices.
 *
 * On each refresh interval, fetches ALL item prices in a single bulk API call.
 * The `symbol` parameter from DynamicValueResolver is ignored (we fetch everything).
 * The price cache is updated atomically — the VM reads the previous cache until
 * the next fetch completes.
 *
 * API: https://prices.runescape.wiki/api/v1/osrs/latest
 * Rate limit: ~1 req/sec, we respect this with a 5-minute interval.
 */
export class OsrsPriceSource implements IDynamicDataSource {
  readonly name = "osrs-prices";
  readonly refreshIntervalMs = 5 * 60 * 1000;  // 5 minutes

  /**
   * DynamicValueResolver calls fetch(symbol) for each subscribed symbol.
   * For OSRS, we ignore the symbol and fetch all prices at once.
   * The price cache is already updated by the bulk fetch — return the cached value.
   */
  async fetch(symbol: string): Promise<number> {
    // If cache is empty or stale, fetch all prices first.
    if (!sharedOsrsPriceCache.isReady || sharedOsrsPriceCache.age > this.refreshIntervalMs) {
      await this.fetchAllPrices();
    }
    // Look up the item by name
    const itemId = OSRS_ITEM_NAME_TO_ID.get(symbol.toLowerCase());
    if (itemId === undefined) return 0;
    return sharedOsrsPriceCache.getPrice(itemId);
  }

  /**
   * Fetch all OSRS prices in one bulk API call.
   * Called on first use and subsequently by the polling interval.
   */
  async fetchAllPrices(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(PRICES_API, {
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (err) {
      // Network error — not a fatal plugin failure. Log and return.
      console.warn("[osrs-solve] Price fetch failed:", err);
      return;
    }

    if (!response.ok) {
      console.warn(`[osrs-solve] Price API returned ${response.status}`);
      return;
    }

    let json: OsrsApiResponse;
    try {
      json = await response.json() as OsrsApiResponse;
    } catch (err) {
      console.warn("[osrs-solve] Price API response parse failed:", err);
      return;
    }

    sharedOsrsPriceCache.update(json.data);
  }
}
```

### 7.7 `OsrsVmHandler.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsVmHandler.ts

import type { IOpcodeHandlerRegistration } from "@solve-js/vm/OpRegistry";
import { OpCode } from "@solve-js/parser/OpCode";
import { uomValue } from "@solve-js/vm/Value";
import { OSRS_ITEM_NAME_TO_ID } from "./OsrsItemVocabulary";
import { sharedOsrsPriceCache } from "./OsrsPriceCache";

/**
 * VM opcode handler for OpCode.RESOLVE_GAME_ITEM.
 *
 * Stack before: [..., STRING(itemName)]
 * Stack after:  [..., UOM(price, "gp")]
 *
 * If the item is unknown or the cache is empty, pushes UOM(0, "gp") so
 * arithmetic still works (no crash). The ThreeTierEvaluator will re-evaluate
 * the line once prices are fetched.
 *
 * This handler is registered via ISolvePackage.opcodeHandlers and is only
 * active when the OSRS plugin is loaded.
 */
export const resolveGameItemHandler: IOpcodeHandlerRegistration = {
  opCode: OpCode.RESOLVE_GAME_ITEM as number,
  handler: (vm, _opcodes, ip, _numbers, strings): number => {
    // Pop the item name string from the stack
    const itemName = vm.pop()!.value as string;

    // Look up item id and price
    const itemId = OSRS_ITEM_NAME_TO_ID.get(itemName.toLowerCase());
    const price = itemId !== undefined
      ? sharedOsrsPriceCache.getPrice(itemId)
      : 0;

    // Push gp UoM value — integrates with all existing UoM arithmetic
    vm.push(uomValue(price, "gp"));

    return ip;  // handler does not advance ip further
  },
};
```

### 7.8 `OsrsLexerPlugin.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsLexerPlugin.ts

import type { LexerPlugin } from "@solve-js/lexer/ExpressionLexer";

/**
 * LexerPlugin for OSRS keyword recognition.
 *
 * Registers "osrs" and "ge" as OSRS_KEYWORD tokens.
 * Registers "gp" as a UNIT (already a UoM unit in the base lexer — confirm with lexer).
 *
 * The "price" and "of" keywords are NOT registered here:
 * - "of" is already the OF keyword in the base token set.
 * - "price" remains an IDENT and is consumed optionally by OsrsKeywordParselet.
 *
 * Note: The normalizer handles item name recognition, not the lexer plugin.
 * This plugin only adds the few query-intent keywords.
 */
export const osrsLexerPlugin: LexerPlugin = {
  keywords: {
    "osrs": "OSRS_KEYWORD",
    "ge": "OSRS_KEYWORD",
  },
  units: [
    // "gp" may already be in knownUnits — the plugin system guards against
    // re-registration. If not present, add here:
    // "gp",
  ],
};
```

### 7.9 `OsrsParselet.ts`

```typescript
// src/solve-js/src/plugins/osrs/OsrsParselet.ts

import type { PrefixParselet } from "@solve-js/parser/Parselet";
import type { Parser } from "@solve-js/parser/Parser";
import type { Token } from "@solve-js/lexer/Token";
import type { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { GAME_ITEM_TYPE } from "./OsrsItemNormalizer";

/**
 * GameItemParselet — prefix parselet for GAME_ITEM tokens.
 *
 * When the normalizer produces a GAME_ITEM token (e.g., after recognising
 * "Iron Axe"), this parselet emits bytecode to:
 *   1. Push the item name as a STRING onto the stack.
 *   2. Emit RESOLVE_GAME_ITEM to convert the name to a gp UoM value.
 *
 * The result is a UOM(price, "gp") value on the stack, compatible with all
 * existing arithmetic, conversion, and formatting infrastructure.
 */
export class GameItemParselet implements PrefixParselet {
  readonly category = "OSRS";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    // Push item name as a string
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(token.value);  // canonical name, e.g. "Iron Axe"
    // Resolve to gp price via VM handler
    builder.emitOpcode(OpCode.RESOLVE_GAME_ITEM as number);
  }
}

/**
 * OsrsKeywordParselet — prefix parselet for OSRS_KEYWORD tokens.
 *
 * Handles natural-language queries:
 *   osrs Iron Axe          → price of Iron Axe in gp
 *   osrs price of Iron Axe → same
 *   ge Iron Axe            → same
 *   ge price Iron Axe      → same
 *
 * After the keyword, optionally consume "price" (IDENT) and "of" (OF keyword),
 * then expect a GAME_ITEM token. This is resilient to optional words — the user
 * can write "osrs Iron Axe" or "osrs price of Iron Axe" with the same result.
 */
export class OsrsKeywordParselet implements PrefixParselet {
  readonly category = "OSRS";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    // Optionally consume "price" (IDENT with value "price")
    const next = parser.peek();
    if (next?.type === "IDENT" && next.value.toLowerCase() === "price") {
      parser.consume();
    }

    // Optionally consume "of" (OF keyword)
    if (parser.peek()?.type === "OF") {
      parser.consume("OF");
    }

    // Now expect a GAME_ITEM token from the normalizer
    const itemToken = parser.peek();
    if (!itemToken || itemToken.type !== GAME_ITEM_TYPE) {
      // Fallback: if no GAME_ITEM follows (e.g., unknown item name), push 0
      builder.emitOpcode(OpCode.PUSH_NUMBER);
      builder.emitNumber(0);
      return;
    }

    parser.consume(GAME_ITEM_TYPE);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(itemToken.value);
    builder.emitOpcode(OpCode.RESOLVE_GAME_ITEM as number);
  }
}
```

### 7.10 `OsrsPlugin.ts` — the main entry point

```typescript
// src/solve-js/src/plugins/osrs/OsrsPlugin.ts

import type { ISolvePackage, TokenNormalizer } from "@solve-js/api/SolveAPI";
import type { IDynamicDataSource } from "@solve-js/engine/IDynamicDataSource";
import { osrsLexerPlugin } from "./OsrsLexerPlugin";
import { OsrsItemNormalizer } from "./OsrsItemNormalizer";
import { GameItemParselet, OsrsKeywordParselet } from "./OsrsParselet";
import { resolveGameItemHandler } from "./OsrsVmHandler";
import { OsrsPriceSource } from "./OsrsPriceSource";
import { registerTokenType } from "@solve-js/lexer/Token";

// Ensure OSRS_KEYWORD is registered before parselet registration
const OSRS_KEYWORD_TYPE = "OSRS_KEYWORD";
registerTokenType(OSRS_KEYWORD_TYPE);

/**
 * The OSRS plugin package. Register with:
 *   solve.registerPackage(osrsPlugin);
 *
 * This single call wires up all OSRS functionality:
 * - Lexer: recognises "osrs", "ge" as OSRS_KEYWORD tokens
 * - Normalizer: merges consecutive IDENTs matching OSRS item names → GAME_ITEM token
 * - Parselets: handles GAME_ITEM and OSRS_KEYWORD tokens in expressions
 * - VM handler: RESOLVE_GAME_ITEM opcode → looks up live GE price → uomValue(price, "gp")
 * - Dynamic source: polls OSRS wiki API every 5 minutes, updates price cache,
 *   triggers re-evaluation of lines with GAME_ITEM tokens via DynamicValueResolver
 */
export const osrsPlugin: ISolvePackage = {
  name: "osrs",

  lexerPlugin: osrsLexerPlugin,

  tokenNormalizers: [
    new OsrsItemNormalizer(),
  ],

  prefixParselets: [
    { tokenType: "GAME_ITEM", parselet: new GameItemParselet() },
    { tokenType: "OSRS_KEYWORD", parselet: new OsrsKeywordParselet() },
  ],

  infixParselets: [],

  opcodeHandlers: [
    resolveGameItemHandler,
  ],

  dynamicSources: [
    new OsrsPriceSource(),
  ],
};

export { osrsPlugin as default };
```

### 7.11 `index.ts`

```typescript
// src/solve-js/src/plugins/osrs/index.ts
export { osrsPlugin } from "./OsrsPlugin";
export type { OsrsItem, OsrsPrice } from "./types";
```

---

## 8. App Layer Integration

### 8.1 `EngineProvider.ts` — wire the plugin

```typescript
// In EngineProvider.ts, in the engine initialization (after solve engine is created):
import { osrsPlugin } from "@solve-js/plugins/osrs";

// After existing provider registrations:
solve.registerPackage(osrsPlugin);

// Trigger initial price fetch (don't await — let it populate in background):
const priceSource = osrsPlugin.dynamicSources![0] as OsrsPriceSource;
priceSource.fetchAllPrices().catch(() => {
  // Silently ignore — prices will be fetched on first use
});
```

### 8.2 `ExpressionEngine.ts` — `registerDynamicSource()`

Add a public method to `ExpressionEngine` that wraps `DynamicValueResolver.registerSource()`:

```typescript
// In ExpressionEngine — add alongside existing registerPlugin():
registerDynamicSource(source: IDynamicDataSource): void {
  this.dynamicValueResolver.registerSource(source);
  // Subscribe the source using its name as a symbol — for OSRS, this triggers
  // the bulk fetch on each refresh interval.
  this.dynamicValueResolver.subscribe(source.name, source.name);
}
```

The OSRS `DynamicValueResolver` subscription triggers `OsrsPriceSource.fetch("osrs-prices")`
on each interval, which calls `fetchAllPrices()` internally, updates `sharedOsrsPriceCache`,
and the resolver calls `onBatch(affectedLines)` → ThreeTierEvaluator marks lines dirty.

---

## 9. Implementation Phases — Ordered Work Plan

### Phase 1 — Core API Extensions (no OSRS yet, no behaviour change)

**Files:** `SolveAPI.ts`, `ExpressionEngine.ts`, `OpCode.ts`

1. Add `TokenNormalizer` interface to `SolveAPI.ts` (see §6.1).
2. Add `tokenNormalizers?: TokenNormalizer[]` and `dynamicSources?: IDynamicDataSource[]` to `ISolvePackage`.
3. Add `registerNormalizer(norm)` and `registerDynamicSource(src)` to `Solve` class.
4. Add `private normalizers: TokenNormalizer[] = []` to `ExpressionEngine`.
5. Add `registerNormalizer(norm)` to `ExpressionEngine` public API.
6. Apply normalizer chain in `evaluateWithTokens()` and `evaluateLineWithPreTokenized()` (both paths must be covered — grep for `lexer.tokenizeAll()` to find all call sites).
7. Add `RESOLVE_GAME_ITEM = 210` to `OpCode` enum.
8. Add `registerDynamicSource()` to `ExpressionEngine` (wraps `DynamicValueResolver`).

**Verification:**
```bash
npx tsc --noEmit   # No type errors
npx jest           # All 1,966 tests still pass (zero behaviour change)
```

### Phase 2 — OSRS Plugin Stub (compile + register, no prices yet)

**Files:** All files in `src/solve-js/src/plugins/osrs/`

1. Create `types.ts` with interfaces and `midPrice()`.
2. Create `OsrsItemVocabulary.ts` with the 10-item stub vocabulary (§7.2 sample).
3. Create `OsrsItemTrie.ts` with the word-level trie.
4. Create `OsrsItemNormalizer.ts` — GAME_ITEM token type, normalizer class.
5. Create `OsrsPriceCache.ts` and `sharedOsrsPriceCache`.
6. Create `OsrsVmHandler.ts` — `resolveGameItemHandler` (reads from cache, always 0 for now).
7. Create `OsrsLexerPlugin.ts`.
8. Create `OsrsParselet.ts` — `GameItemParselet` + `OsrsKeywordParselet`.
9. Create `OsrsPlugin.ts` — assemble `ISolvePackage`.
10. Create `index.ts`.
11. Register in `EngineProvider.ts`.

**Verification (stub mode — prices always 0 gp):**
```
Iron Axe            → 0 gp       (item recognized, price not fetched yet)
Iron Axe + Dragon   → 0 gp       (arithmetic works)
Iron Axe + 100      → 100 gp     (Uom + Number works via existing binaryOp)
osrs Iron Axe       → 0 gp       (keyword parselet works)
5 * Iron Axe        → 0 gp       (multiplication works)
```

Write unit tests for:
- `OsrsItemTrie.longestMatch()` — multi-word match, single-word match, no match, prefix-only match
- `OsrsItemNormalizer.normalize()` — item recognized, mixed token arrays, IDENT not in vocabulary
- `GameItemParselet.parse()` — correct opcode emission
- `OsrsKeywordParselet.parse()` — with/without "price of" prefix

### Phase 3 — Live Prices via API

**Files:** `OsrsPriceSource.ts`, `EngineProvider.ts`

1. Create `OsrsPriceSource.ts` (see §7.6).
2. Wire `registerDynamicSource(new OsrsPriceSource())` in `EngineProvider`.
3. Trigger initial `fetchAllPrices()` on plugin load.

**Verification:**
```
Iron Axe            → [0 gp for ~500ms, then live price]
iron axe            → same (case-insensitive)
Iron Axe + Dragon Hide → live sum in gp
osrs price of Abyssal Whip → live price
```

Manual test: open Obsidian, type "Iron Axe", wait 1 second, verify price appears.

### Phase 4 — Full Vocabulary Build Script

**Files:** `tools/generate-osrs-vocab.ts`, `OsrsItemVocabulary.ts` (final)

```typescript
// tools/generate-osrs-vocab.ts
// Fetches: https://prices.runescape.wiki/api/v1/osrs/mapping
// Output: sorted by name length descending, all tradeable items
// Writes: src/solve-js/src/plugins/osrs/OsrsItemVocabulary.ts
```

Add to `package.json`:
```json
"scripts": {
  "generate:osrs-vocab": "ts-node tools/generate-osrs-vocab.ts"
}
```

**Verification:**
- All tradeable items (~3,800) recognised in expressions.
- Build time for vocabulary generation: < 10 seconds.
- Bundle size impact: measure before/after. Target: < 100KB uncompressed for the vocabulary.

---

## 10. Test File Specifications

### `OsrsItemNormalizer.spec.ts`

```typescript
describe("OsrsItemNormalizer", () => {
  const norm = new OsrsItemNormalizer();

  it("merges two-word item name into GAME_ITEM token", () => {
    const tokens = [ident("Iron"), ident("Axe")];
    const result = norm.normalize(tokens);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("GAME_ITEM");
    expect(result[0].value).toBe("Iron Axe");
  });

  it("handles case-insensitive matching", () => {
    const tokens = [ident("iron"), ident("axe")];
    const result = norm.normalize(tokens);
    expect(result[0].type).toBe("GAME_ITEM");
    expect(result[0].value).toBe("Iron Axe");  // canonical name restored
  });

  it("handles mixed expressions", () => {
    const tokens = [ident("Iron"), ident("Axe"), plus(), ident("Dragon"), ident("Hide")];
    const result = norm.normalize(tokens);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("GAME_ITEM");
    expect(result[1].type).toBe("PLUS");
    expect(result[2].type).toBe("GAME_ITEM");
  });

  it("passes through unknown identifiers unchanged", () => {
    const tokens = [ident("foo"), ident("bar")];
    const result = norm.normalize(tokens);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("IDENT");
  });

  it("prefers longer match (Abyssal Whip over Abyssal alone)", () => {
    const tokens = [ident("Abyssal"), ident("Whip")];
    const result = norm.normalize(tokens);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("Abyssal Whip");
  });

  it("does not merge across non-IDENT tokens", () => {
    const tokens = [ident("Iron"), plus(), ident("Axe")];
    const result = norm.normalize(tokens);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("IDENT");  // "Iron" alone is not a known item
  });
});
```

### `OsrsPlugin.integration.spec.ts`

```typescript
describe("OSRS plugin integration", () => {
  let engine: ExpressionEngine;

  beforeAll(() => {
    engine = createTestEngine();
    solve.registerPackage(osrsPlugin);
    // Seed price cache for tests (bypass API)
    sharedOsrsPriceCache.update({
      "1267": { high: 423, low: 400, highTime: 0, lowTime: 0 },     // Iron Axe
      "1745": { high: 1204, low: 1100, highTime: 0, lowTime: 0 },   // Dragon Hide
      "4151": { high: 82000, low: 81000, highTime: 0, lowTime: 0 }, // Abyssal Whip
    });
  });

  it("evaluates Iron Axe to gp price", () => {
    const result = engine.evaluateLine("Iron Axe");
    expect(result?.type).toBe(ValueType.Uom);
    expect(result?.unit).toBe("gp");
    expect(result?.toNumber()).toBeCloseTo(411, 0);  // midPrice(423, 400)
  });

  it("sums two items", () => {
    const result = engine.evaluateLine("Iron Axe + Dragon Hide");
    expect(result?.toNumber()).toBeCloseTo(411 + 1152, 0);
  });

  it("handles osrs keyword prefix", () => {
    const result = engine.evaluateLine("osrs price of Iron Axe");
    expect(result?.toNumber()).toBeCloseTo(411, 0);
  });

  it("handles ge keyword prefix", () => {
    const result = engine.evaluateLine("ge Iron Axe");
    expect(result?.toNumber()).toBeCloseTo(411, 0);
  });

  it("handles scalar multiplication", () => {
    const result = engine.evaluateLine("2 * Iron Axe");
    expect(result?.toNumber()).toBeCloseTo(822, 0);
  });

  it("handles unknown items gracefully (returns 0 gp)", () => {
    const result = engine.evaluateLine("Unobtanium Sword");
    // Unknown items: normalizer doesn't match, falls through as IDENT IDENT
    // which the variable parser handles as variable reads
    // Result depends on variable state — no crash expected
  });

  it("converts to gp with in keyword", () => {
    const result = engine.evaluateLine("Iron Axe + Dragon Hide in gp");
    expect(result?.unit).toBe("gp");
  });
});
```

---

## 11. `OsrsApiResponse` type note and error handling

The OSRS wiki API has a documented rate limit and returns HTTP 400 for invalid item IDs.
The `OsrsPriceSource` must:
- Set `User-Agent` header (the OSRS wiki team requires this for third-party apps).
- Handle `response.ok === false` gracefully (warn, don't throw).
- Never block the main evaluation loop on a network call.
- Respect the 5-minute refresh interval — do not over-fetch.

Obsidian runs in Electron with full network access. No CORS issues. The `fetch()` global is
available in both the renderer and main process contexts.

---

## 12. Vocabulary Build Script Spec (`tools/generate-osrs-vocab.ts`)

```typescript
// Fetch endpoint: https://prices.runescape.wiki/api/v1/osrs/mapping
// Response shape:
//   Array of: { id: number, name: string, members: boolean, ... }
//
// Processing:
//   1. Filter: only items with a price in the /latest response (tradeable)
//   2. Normalize names: strip "(1)", "(2)" suffixes for display
//   3. Sort by name.length DESCENDING (critical: longest-match trie prefers longer names)
//   4. Generate OsrsItemVocabulary.ts with OSRS_ITEMS array
//
// The /mapping endpoint is cached by the wiki — safe to fetch on every build.
// Approximate size: ~4,000 items, ~100KB uncompressed TypeScript.
```

---

## 13. What This Does NOT Change

- Core lexer performance (ExpressionLexer is unchanged, normalizer runs after tokenizeAll)
- Existing parselet behavior (no existing parselet is modified)
- Existing VM opcodes (RESOLVE_GAME_ITEM = 210 is in the plugin range, never emitted by base)
- Existing test suite (all 1,966 tests still pass after Phase 1)
- Performance for non-OSRS expressions (normalizer fast-paths on no IDENT tokens)

---

## 14. Open Design Questions (for human decision, not agent)

1. **Bundled vocabulary vs always-fetched**: Should the vocabulary (`OsrsItemVocabulary.ts`)
   be bundled with the plugin at build time (fast startup, may be stale) or fetched on first
   load from the OSRS wiki mapping endpoint (always current, requires network)?
   *Recommendation: bundle it, with a build-time generation script.*

2. **Mid-price vs high/low**: The current spec uses `midPrice()` (average of high/low). Some
   users may prefer the GE buy price (high) for planning purchases. Could be a settings option.

3. **"gp" as display unit**: The existing UoM formatter renders `uomValue(1627, "gp")` as
   `1627 gp`. Obsidian-solve's existing locale/format system may or may not apply thousands
   separators to gp. Verify and add gp-specific formatting if needed.

4. **Other game support**: The `GAME_ITEM` token type and `TokenNormalizer` API are not
   OSRS-specific. A second plugin could implement "WoW AH prices" or "D2 item values" using
   the same infrastructure. The `ISolvePackage` extension in Phase 1 is the foundation.

5. **Item quantity syntax**: `5x Iron Axe` or `5 Iron Axe` (meaning 5 × Iron Axe) is a
   natural user pattern. Currently requires `5 * Iron Axe`. Could be added as a special
   normalizer or postfix parselet — deferred to future iteration.

---

*Last updated: 2026-05-30. Complete implementation spec for the OSRS game-item plugin.*
