import { describe, expect, test, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { QueryClient } from "@tanstack/query-core";
import { OsrsItemTrie } from "@solve-js-examples/osrs/OsrsItemTrie";
import { osrsItemNormalizerRule, GAME_ITEM_TYPE } from "@solve-js-examples/osrs/OsrsItemNormalizer";
import { GameItemParselet, OsrsKeywordParselet, OSRS_PLUGIN_FN_IDX } from "@solve-js-examples/osrs/OsrsParselet";
import { registerOsrsPluginFunction, unregisterOsrsPluginFunction } from "@solve-js-examples/osrs/OsrsVmHandler";
import { setActiveQueryClient } from "@solve-js/services/DataQueryService";
import { uomValue } from "@solve-js/vm/Value";
import { OSRS_ITEMS, OSRS_ITEM_NAME_TO_ID, osrsItemQueryKey } from "@solve-js-examples/osrs/OsrsItemVocabulary";

/** Shared QueryClient for tests — seeds prices for VM handler reads. */
const qc = new QueryClient();

/** Helper: seed a price into a TanStack Query cache for a given item ID. */
function seedPrice(q: QueryClient, itemId: number, high: number, low: number): void {
  const price = (high + low) / 2;
  q.setQueryData(osrsItemQueryKey(itemId), uomValue(price, "gp"));
}

/** Helper: clear all seeded OSRS prices from a TanStack Query cache. */
function clearSeededPrices(q: QueryClient): void {
  q.removeQueries({ queryKey: ["osrs"] });
}
import { osrsLexerVocabulary } from "@solve-js-examples/osrs/OsrsLexerVocabulary";
import type { OsrsItem } from "@solve-js-examples/osrs/types";
import { ExpressionLexer, LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { PrecedenceParser } from "@solve-js/parser/PrecedenceParser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { TokenNormalizer } from "@solve-js/normalizer/TokenNormalizer";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { OSRS_PACKAGE } from "@solve-js-examples/osrs/OsrsPackage";

/** OSRS is an example package, not a built-in — register it explicitly alongside the built-ins. */
function createEngineWithOsrs(): ExpressionEngine {
  return new ExpressionEngine("en", false, undefined, undefined, [...BUILTIN_PACKAGES, OSRS_PACKAGE]);
}

// ── Token helpers ──────────────────────────────────────────────────────────

function ident(value: string, offset = 0, line = 1, col = 1): LexerToken {
  return new LexerToken("IDENT", tokenTypeId("IDENT"), value, value, offset, 0, line, col);
}
function plus(offset = 0): LexerToken {
  return new LexerToken("PLUS", tokenTypeId("PLUS"), "+", "+", offset, 0, 1, offset + 1);
}
function numberToken(n: number, offset = 0): LexerToken {
  const s = String(n);
  return new LexerToken("NUMBER", tokenTypeId("NUMBER"), s, s, offset, 0, 1, offset + 1);
}

// ── Stub items for custom trie tests ───────────────────────────────────────

const TEST_ITEMS: OsrsItem[] = [
  { id: 1, name: "Iron Axe", nameLower: "iron axe" },
  { id: 2, name: "Dragon Hide", nameLower: "dragon hide" },
  { id: 3, name: "Abyssal Whip", nameLower: "abyssal whip" },
  { id: 4, name: "Abyssal Dagger", nameLower: "abyssal dagger" },
  { id: 5, name: "Bones", nameLower: "bones" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// OsrsItemTrie
// ═══════════════════════════════════════════════════════════════════════════════

describe("OsrsItemTrie", () => {
  let trie: OsrsItemTrie;

  beforeEach(() => {
    trie = new OsrsItemTrie(TEST_ITEMS);
  });

  describe("longestMatch", () => {
    test("matches two-word item name", () => {
      const tokens = [ident("Iron"), ident("Axe")];
      const match = trie.longestMatch(tokens, 0);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Iron Axe");
      expect(match!.wordCount).toBe(2);
    });

    test("matches single-word item name", () => {
      const tokens = [ident("Bones")];
      const match = trie.longestMatch(tokens, 0);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Bones");
      expect(match!.wordCount).toBe(1);
    });

    test("matches case-insensitively", () => {
      const tokens = [ident("IRON"), ident("axe")];
      const match = trie.longestMatch(tokens, 0);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Iron Axe");
    });

    test("returns null for unknown item", () => {
      const tokens = [ident("foo"), ident("bar")];
      expect(trie.longestMatch(tokens, 0)).toBeNull();
    });

    test("returns null for partial prefix match only", () => {
      // "Abyssal" alone is not an item (only "Abyssal Whip" and "Abyssal Dagger" are)
      const tokens = [ident("Abyssal")];
      expect(trie.longestMatch(tokens, 0)).toBeNull();
    });

    test("prefers longest match (Abyssal Whip over Abyssal Dagger when first word is ambiguous)", () => {
      // Both "Abyssal Whip" and "Abyssal Dagger" share the first word "abyssal"
      // The trie walks until a dead end — if tokens are ["Abyssal", "Whip"],
      // it matches "Abyssal Whip" (4 words... wait, 2 words)
      const tokens = [ident("Abyssal"), ident("Whip")];
      const match = trie.longestMatch(tokens, 0);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Abyssal Whip");
    });

    test("stops at non-IDENT token boundary", () => {
      const tokens = [ident("Iron"), plus(), ident("Axe")];
      // "Iron" at pos 0 has "+" as next token, not IDENT → no match
      expect(trie.longestMatch(tokens, 0)).toBeNull();
    });

    test("matches at non-zero startIdx", () => {
      const tokens = [plus(), ident("Iron"), ident("Axe")];
      const match = trie.longestMatch(tokens, 1);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Iron Axe");
    });

    test("returns null when startIdx is beyond array length", () => {
      const tokens = [ident("Iron")];
      expect(trie.longestMatch(tokens, 5)).toBeNull();
    });
  });

  describe("construction", () => {
    test("handles empty item list", () => {
      const emptyTrie = new OsrsItemTrie([]);
      expect(emptyTrie.longestMatch([ident("test")], 0)).toBeNull();
    });

    test("handles items with uppercase canonical names", () => {
      // The nameLower is what's used for trie insertion; the name field is preserved
      const items: OsrsItem[] = [{ id: 99, name: "Test Item", nameLower: "test item" }];
      const t = new OsrsItemTrie(items);
      const match = t.longestMatch([ident("Test"), ident("Item")], 0);
      expect(match).not.toBeNull();
      expect(match!.item.name).toBe("Test Item");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OsrsItemNormalizer
// ═══════════════════════════════════════════════════════════════════════════════

describe("OsrsItemNormalizer", () => {
  const rule = osrsItemNormalizerRule(TEST_ITEMS);

  test("fuses two-word item name into GAME_ITEM token", () => {
    const tokens = [ident("Iron"), ident("Axe")];
    const match = rule.match(tokens, 0);
    expect(match).not.toBeNull();
    expect(match!.consumed).toBe(2);
    expect(match!.replacement).toHaveLength(1);
    expect(match!.replacement[0].type).toBe(GAME_ITEM_TYPE);
    expect(match!.replacement[0].value).toBe("Iron Axe");
  });

  test("fuses single-word item name into GAME_ITEM", () => {
    const tokens = [ident("Bones")];
    const match = rule.match(tokens, 0);
    expect(match).not.toBeNull();
    expect(match!.consumed).toBe(1);
    expect(match!.replacement[0].value).toBe("Bones");
  });

  test("returns null for non-IDENT token at position", () => {
    const match = rule.match([numberToken(5)], 0);
    expect(match).toBeNull();
  });

  test("returns null for unknown identifiers", () => {
    const tokens = [ident("foo"), ident("bar")];
    expect(rule.match(tokens, 0)).toBeNull();
  });

  test("returns null when pos is out of bounds", () => {
    const tokens = [ident("Iron")];
    expect(rule.match(tokens, 5)).toBeNull();
  });

  test("rule name is set correctly", () => {
    expect(rule.name).toBe("osrs:item-fusion");
  });

  test("priority is 60 (above implicit multiply at 50)", () => {
    expect(rule.priority).toBe(60);
  });

  test("fused token preserves position info from first source token", () => {
    const tokens = [ident("Iron", 10, 2, 5), ident("Axe", 15, 2, 10)];
    const match = rule.match(tokens, 0);
    expect(match).not.toBeNull();
    expect(match!.replacement[0].offset).toBe(10);
    expect(match!.replacement[0].line).toBe(2);
    expect(match!.replacement[0].col).toBe(5);
  });

  test("case-insensitive match returns canonical name", () => {
    const tokens = [ident("IRON"), ident("AXE")];
    const match = rule.match(tokens, 0);
    expect(match).not.toBeNull();
    expect(match!.replacement[0].value).toBe("Iron Axe");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GameItemParselet
// ═══════════════════════════════════════════════════════════════════════════════

describe("GameItemParselet", () => {
  test("compiles GAME_ITEM token to PUSH_STRING + CALL_PLUGIN", () => {
    const parselet = new GameItemParselet();
    const builder = new BytecodeBuilder();
    const itemToken = new LexerToken(
      GAME_ITEM_TYPE, tokenTypeId(GAME_ITEM_TYPE),
      "Iron Axe", "Iron Axe", 0, 0, 1, 1,
    );

    // We need a parser mock since we don't use it (the token parameter is used directly)
    const mockParser = {} as any;
    parselet.parse(mockParser, itemToken, builder);

    const program = builder.build();
    // Bytecode layout: PUSH_STRING(13), string_index(0), CALL_PLUGIN(50), fnIdx(50), argCount(1)
    const opcodes = Array.from(program.opcodes);
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Iron Axe");
  });

  test("category is OSRS", () => {
    expect(new GameItemParselet().category).toBe("OSRS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OsrsKeywordParselet
// ═══════════════════════════════════════════════════════════════════════════════

describe("OsrsKeywordParselet", () => {
  test("compiles osrs keyword + GAME_ITEM to CALL_PLUGIN bytecode", () => {
    const parselet = new OsrsKeywordParselet();
    const builder = new BytecodeBuilder();

    const gameItemToken = new LexerToken(
      GAME_ITEM_TYPE, tokenTypeId(GAME_ITEM_TYPE),
      "Abyssal Whip", "Abyssal Whip", 0, 0, 1, 1,
    );

    // Mock parser: peek() returns the GAME_ITEM token, consume() returns it
    const mockParser = {
      peek: () => gameItemToken,
      consume: (expected?: string) => {
        if (expected) expect(gameItemToken.type).toBe(expected);
        return gameItemToken;
      },
    } as any;

    parselet.parse(mockParser, gameItemToken, builder);

    const program = builder.build();
    const opcodes = Array.from(program.opcodes);
    // Bytecode: PUSH_STRING(13), string_index(0), CALL_PLUGIN(50), fnIdx(50), argCount(1)
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Abyssal Whip");
  });

  test("throws a parse error when GAME_ITEM token is missing (was: silently pushed 0)", () => {
    // Bare "osrs" with nothing after it used to compile to PUSH_NUMBER 0 —
    // indistinguishable from a genuine "0 gp" result. It must now surface
    // as a parse error instead.
    const parselet = new OsrsKeywordParselet();
    const builder = new BytecodeBuilder();

    const mockParser = {
      peek: () => null,
    } as any;

    expect(() => parselet.parse(mockParser, {} as any, builder)).toThrow(/Expected an OSRS item name/);
  });

  test("compiles keyword + GAME_ITEM to bytecode (no 'price'/'of' filler words)", () => {
    const parselet = new OsrsKeywordParselet();
    const builder = new BytecodeBuilder();

    const gameItemToken = new LexerToken(
      GAME_ITEM_TYPE, tokenTypeId(GAME_ITEM_TYPE),
      "Dragon Axe", "Dragon Axe", 0, 0, 1, 1,
    );

    let consumeCount = 0;
    const mockParser = {
      peek: () => gameItemToken,
      consume: (_expected?: string) => {
        consumeCount++;
        return gameItemToken;
      },
    } as any;

    parselet.parse(mockParser, gameItemToken, builder);

    // Verifies the GAME_ITEM token is consumed and compiled into bytecode
    expect(consumeCount).toBe(1);
    const program = builder.build();
    const opcodes = Array.from(program.opcodes);
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Dragon Axe");
  });

  test("consumes 'price'/'of' filler words when present before GAME_ITEM", () => {
    const parselet = new OsrsKeywordParselet();
    const builder = new BytecodeBuilder();

    const priceToken = new LexerToken("IDENT", tokenTypeId("IDENT"), "price", "price", 0, 0, 1, 1);
    const ofToken = new LexerToken("OF", tokenTypeId("OF"), "of", "of", 0, 0, 1, 1);
    const gameItemToken = new LexerToken(
      GAME_ITEM_TYPE, tokenTypeId(GAME_ITEM_TYPE),
      "Dragon Axe", "Dragon Axe", 0, 0, 1, 1,
    );

    const peekQueue = [priceToken, ofToken, gameItemToken];
    let consumeCount = 0;
    const mockParser = {
      peek: () => (peekQueue.length > 0 ? peekQueue[0] : null),
      consume: (_expected?: string) => {
        consumeCount++;
        return peekQueue.shift()!;
      },
    } as any;

    parselet.parse(mockParser, gameItemToken, builder);

    // Consumed: "price" token + GAME_ITEM token (not "of" — OF is only checked, not consumed after peek)
    // Wait — let me re-check: the parselet checks if peek()?.type === "OF", then calls consume("OF").
    // Since we return "of" from peek, the parselet consumes it. So: price → of → gameItem = 3 consumes
    expect(consumeCount).toBe(3);
    const program = builder.build();
    expect(program.strings[0]).toBe("Dragon Axe");
  });

  test("category is OSRS", () => {
    expect(new OsrsKeywordParselet().category).toBe("OSRS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OsrsVmHandler (pluginFunctionRegistry)
// ═══════════════════════════════════════════════════════════════════════════════

describe("OsrsPluginFunction", () => {
  beforeEach(() => {
    clearSeededPrices(qc);
    setActiveQueryClient(qc);
    unregisterOsrsPluginFunction();
  });

  afterEach(() => {
    registerOsrsPluginFunction();
  });

  test("registers at OSRS_PLUGIN_FN_IDX in pluginFunctionRegistry", () => {
    registerOsrsPluginFunction();
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    expect(pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX]).toBeDefined();
    expect(typeof pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX]).toBe("function");
  });

  test("unregister clears the slot", () => {
    registerOsrsPluginFunction();
    unregisterOsrsPluginFunction();
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    expect(pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX]).toBeUndefined();
  });

  test("returns gp UoM from cache for known item", () => {
    registerOsrsPluginFunction();
    seedPrice(qc, 1267, 423, 400);
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    const fn = pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
    const result = fn([{ value: "Iron Axe" }]);
    expect(result.unit).toBe("gp");
    expect(Math.abs(result.value - 411)).toBeLessThan(12);
  });

  test("returns 0 gp for unknown item", () => {
    registerOsrsPluginFunction();
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    const fn = pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
    const result = fn([{ value: "Unobtanium Sword" }]);
    expect(result.value).toBe(0);
    expect(result.unit).toBe("gp");
  });

  test("returns 0 gp when cache is empty", () => {
    registerOsrsPluginFunction();
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    const fn = pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
    const result = fn([{ value: "Iron Axe" }]);
    expect(result.value).toBe(0);
  });

  test("looks up item case-insensitively", () => {
    registerOsrsPluginFunction();
    seedPrice(qc, 4151, 82000, 81000);
    const { pluginFunctionRegistry } = require("@solve-js/vm/VMBuiltins");
    const fn = pluginFunctionRegistry[OSRS_PLUGIN_FN_IDX];
    const result = fn([{ value: "ABYSSAL WHIP" }]);
    expect(result.unit).toBe("gp");
    expect(result.value).toBeGreaterThan(80000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end: lexer → normalizer → parser → bytecode
// ═══════════════════════════════════════════════════════════════════════════════

describe("OSRS keyword prefix path (end-to-end)", () => {
  function createEngine(): {
    lexer: ExpressionLexer;
    normalizer: TokenNormalizer;
    parser: PrecedenceParser;
  } {
    const lexer = new ExpressionLexer("en");
    lexer.registerVocabulary(osrsLexerVocabulary);

    const normalizer = new TokenNormalizer();
    normalizer.register(osrsItemNormalizerRule());

    const registry = new ParseletRegistry();
    registry.registerPrefix(GAME_ITEM_TYPE, new GameItemParselet());
    registry.registerPrefix("OSRS_KEYWORD", new OsrsKeywordParselet());

    const parser = new PrecedenceParser(registry);

    return { lexer, normalizer, parser };
  }

  test("parses 'osrs Abyssal Whip' through full pipeline", () => {
    const { lexer, normalizer, parser } = createEngine();

    // Step 1: Lex
    lexer.reset("osrs Abyssal Whip");
    const rawTokens = lexer.tokenizeAll();

    // Verify raw tokens: OSRS_KEYWORD, IDENT("Abyssal"), IDENT("Whip")
    expect(rawTokens).toHaveLength(3);
    expect(rawTokens[0].type).toBe("OSRS_KEYWORD");
    expect(rawTokens[1].type).toBe("IDENT");
    expect(rawTokens[2].type).toBe("IDENT");

    // Step 2: Normalize
    const normalized = normalizer.normalize(rawTokens);

    // Verify fusion: OSRS_KEYWORD, GAME_ITEM("Abyssal Whip")
    expect(normalized).toHaveLength(2);
    expect(normalized[0].type).toBe("OSRS_KEYWORD");
    expect(normalized[1].type).toBe(GAME_ITEM_TYPE);
    expect(normalized[1].value).toBe("Abyssal Whip");

    // Step 3: Parse
    const builder = new BytecodeBuilder();
    parser.load(normalized);
    parser.setBuilder(builder);
    parser.parseExpression(0);

    // Step 4: Verify bytecode
    const program = builder.build();
    const opcodes = Array.from(program.opcodes);
    // Layout: PUSH_STRING(13), string_index(0), CALL_PLUGIN(50), fnIdx(50), argCount(1)
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Abyssal Whip");
  });

  test("parses bare 'Iron Axe' through full pipeline (no keyword prefix)", () => {
    const { lexer, normalizer, parser } = createEngine();

    // Step 1: Lex
    lexer.reset("Iron Axe");
    const rawTokens = lexer.tokenizeAll();
    expect(rawTokens).toHaveLength(2);
    expect(rawTokens[0].type).toBe("IDENT");
    expect(rawTokens[1].type).toBe("IDENT");

    // Step 2: Normalize → fuses to GAME_ITEM
    const normalized = normalizer.normalize(rawTokens);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].type).toBe(GAME_ITEM_TYPE);
    expect(normalized[0].value).toBe("Iron Axe");

    // Step 3: Parse
    const builder = new BytecodeBuilder();
    parser.load(normalized);
    parser.setBuilder(builder);
    parser.parseExpression(0);

    // Step 4: Verify bytecode
    const program = builder.build();
    const opcodes = Array.from(program.opcodes);
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Iron Axe");
  });

  test("parses 'ge Dragon Hide' through full pipeline (ge alias for osrs keyword)", () => {
    const { lexer, normalizer, parser } = createEngine();

    // Step 1: Lex — "ge" is also mapped to OSRS_KEYWORD by osrsLexerVocabulary
    lexer.reset("ge Dragon Hide");
    const rawTokens = lexer.tokenizeAll();
    expect(rawTokens).toHaveLength(3);
    expect(rawTokens[0].type).toBe("OSRS_KEYWORD");
    expect(rawTokens[0].value).toBe("ge");
    expect(rawTokens[1].type).toBe("IDENT");
    expect(rawTokens[2].type).toBe("IDENT");

    // Step 2: Normalize
    const normalized = normalizer.normalize(rawTokens);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].type).toBe("OSRS_KEYWORD");
    expect(normalized[1].type).toBe(GAME_ITEM_TYPE);
    expect(normalized[1].value).toBe("Dragon Hide");

    // Step 3: Parse
    const builder = new BytecodeBuilder();
    parser.load(normalized);
    parser.setBuilder(builder);
    parser.parseExpression(0);

    // Step 4: Verify bytecode
    const program = builder.build();
    const opcodes = Array.from(program.opcodes);
    expect(opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(opcodes[4]).toBe(1);
    expect(program.strings[0]).toBe("Dragon Hide");
  });

  test("OsrsKeywordParselet throws when GAME_ITEM is missing after keyword (was: silently pushed 0)", () => {
    const { lexer, normalizer, parser } = createEngine();

    // "osrs" followed by a non-item identifier — normalizer won't fuse it
    lexer.reset("osrs Blarg");
    const rawTokens = lexer.tokenizeAll();
    expect(rawTokens[0].type).toBe("OSRS_KEYWORD");

    // Normalize — "Blarg" is not an OSRS item, stays as IDENT
    const normalized = normalizer.normalize(rawTokens);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].type).toBe("OSRS_KEYWORD");
    expect(normalized[1].type).toBe("IDENT"); // NOT fused

    // Parse — OsrsKeywordParselet sees IDENT, not GAME_ITEM → must throw,
    // not silently push 0 (which was indistinguishable from a real 0 gp result).
    const builder = new BytecodeBuilder();
    parser.load(normalized);
    parser.setBuilder(builder);
    expect(() => parser.parseExpression(0)).toThrow(/Expected an OSRS item name/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Real ExpressionEngine integration (full pipeline including opcode handler + VM)
// ═══════════════════════════════════════════════════════════════════════════════

describe("ExpressionEngine integration", () => {
  test("evaluates 'osrs Abyssal Whip' through full engine pipeline", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 4151, 82000, 81000);

    const result = engine.evaluateLineWithDebug(1, "osrs Abyssal Whip");

    // Should not error
    expect(result.error).toBeUndefined();

    // Should have tokens (normalized: OSRS_KEYWORD + GAME_ITEM)
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0].type).toBe("OSRS_KEYWORD");
    expect(result.tokens[1].type).toBe("GAME_ITEM");
    expect(result.tokens[1].value).toBe("Abyssal Whip");

    // Should produce bytecode: PUSH_STRING + string_index + CALL_PLUGIN + fnIdx + argCount
    expect(result.program.opcodes.length).toBe(5);
    expect(result.program.opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(result.program.opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(result.program.opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(result.program.opcodes[4]).toBe(1);
    expect(result.program.strings[0]).toBe("Abyssal Whip");

    // Should resolve to gp UoM value
    expect(result.value.unit).toBe("gp");
    expect(result.value.value).toBeGreaterThan(80000); // midPrice(82000, 81000) ≈ 81500

    engine.clear();
  });

  test("evaluates bare 'Iron Axe' through full engine pipeline", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    const result = engine.evaluateLineWithDebug(1, "Iron Axe");

    expect(result.error).toBeUndefined();
    // Normalizer fuses IDENT + IDENT → GAME_ITEM
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe("GAME_ITEM");
    expect(result.tokens[0].value).toBe("Iron Axe");

    // Bytecode: PUSH_STRING + string_index + CALL_PLUGIN + fnIdx + argCount
    expect(result.program.opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(result.program.opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(result.program.opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(result.program.opcodes[4]).toBe(1);
    expect(result.program.strings[0]).toBe("Iron Axe");

    // gp value from cache
    expect(result.value.unit).toBe("gp");
    // midPrice(423, 400) = Math.round(823/2) = 412
    expect(Math.abs(Number(result.value.value) - 412)).toBeLessThanOrEqual(1);

    engine.clear();
  });

  test("evaluates 'Iron Axe + Dragon Hide' through full engine pipeline", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    seedPrice(engine.queryClient, 1745, 2100, 2000);
    const result = engine.evaluateLineWithDebug(1, "Iron Axe + Dragon Hide");

    expect(result.error).toBeUndefined();

    // Normalized tokens: GAME_ITEM + PLUS + GAME_ITEM
    expect(result.tokens).toHaveLength(3);
    expect(result.tokens[0].type).toBe("GAME_ITEM");
    expect(result.tokens[1].type).toBe("PLUS");
    expect(result.tokens[2].type).toBe("GAME_ITEM");

    // gp value: Iron Axe ≈ 412 + Dragon Hide ≈ 2050 = ≈ 2462
    expect(result.value.unit).toBe("gp");
    expect(Number(result.value.value)).toBeGreaterThan(2400);
    expect(Number(result.value.value)).toBeLessThan(2500);

    engine.clear();
  });

  test("surfaces a parse error for unknown item after osrs keyword (was: silently returned 0)", () => {
    // OsrsKeywordParselet sees OSRS_KEYWORD + IDENT (not GAME_ITEM) and must
    // report a parse error — a bare "0" here was indistinguishable from a
    // genuine "this item is worth 0 gp" result. See: Issue_OsrsBareKeywordReturnedZero.
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "osrs NonexistentBlarg");

    expect(result.error).toMatch(/Expected an OSRS item name/);

    engine.clear();
  });

  test("evaluates 'osrs.ge(Iron Axe)' dot-notation with bare item name", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 430, 400);
    const result = engine.evaluateLineWithDebug(1, "osrs.ge(Iron Axe)");

    expect(result.error).toBeUndefined();
    expect(result.tokens.some((t: any) => t.type === "OSRS_KEYWORD")).toBe(true);
    expect(result.tokens.some((t: any) => t.type === "DOT")).toBe(true);
    expect(result.tokens.some((t: any) => t.type === "GAME_ITEM")).toBe(true);
    expect(result.value.unit).toBe("gp");
    const mid = Math.round((430 + 400) / 2);
    expect(Math.abs(Number(result.value.value) - mid)).toBeLessThanOrEqual(1);
    expect(result.program.strings[0]).toBe("Iron Axe");

    engine.clear();
  });

  test("evaluates 'osrs.ge(\"Iron Axe\")' dot-notation with quoted item name", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 430, 400);
    const result = engine.evaluateLineWithDebug(1, 'osrs.ge("Iron Axe")');

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    const mid = Math.round((430 + 400) / 2);
    expect(Math.abs(Number(result.value.value) - mid)).toBeLessThanOrEqual(1);
    expect(result.program.strings[0]).toBe("Iron Axe");

    engine.clear();
  });

  test("evaluates 'osrs.price(Dragon Hide)' dot-notation with bare item", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1745, 2100, 2000);
    const result = engine.evaluateLineWithDebug(1, "osrs.price(Dragon Hide)");

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    const mid = Math.round((2100 + 2000) / 2);
    expect(Math.abs(Number(result.value.value) - mid)).toBeLessThanOrEqual(1);
    expect(result.program.strings[0]).toBe("Dragon Hide");

    engine.clear();
  });

  test("returns pending when price cache is empty", () => {
    // Note: engine creates its own QueryClient — no seeds, so cache is empty
    const engine = createEngineWithOsrs();
    const result = engine.evaluateLineWithDebug(1, "Iron Axe");

    expect(result.error).toBeUndefined();
    // Still produces GAME_ITEM token + CALL_PLUGIN bytecode
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe("GAME_ITEM");

    // OsrsAsyncResolver.preflight() returns AsyncCheckResult when cache
    // is empty → engine skips VM → returns Pending value (type 12).
    // ValueType.Pending = 12.
    expect(result.value.type).toBe(12);

    engine.clear();
  });

  test("evaluates ge(Iron Axe) function-call with bare item name (no quotes)", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    const result = engine.evaluateLineWithDebug(1, "ge(Iron Axe)");

    expect(result.error).toBeUndefined();
    // Normalizer fuses IDENT+IDENT → GAME_ITEM inside the parens
    expect(result.tokens.some((t: any) => t.type === "GAME_ITEM")).toBe(true);
    expect(result.tokens.some((t: any) => t.value === "Iron Axe")).toBe(true);

    // Bytecode should reference the item
    expect(result.program.strings[0]).toBe("Iron Axe");

    // gp value from cache
    expect(result.value.unit).toBe("gp");
    expect(Math.abs(Number(result.value.value) - 412)).toBeLessThanOrEqual(1);

    engine.clear();
  });

  test("evaluates ge(\"Iron Axe\") function-call syntax through full pipeline", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    const result = engine.evaluateLineWithDebug(1, 'ge("Iron Axe")');

    expect(result.error).toBeUndefined();

    // Tokens: OSRS_KEYWORD, LPAREN, STRING, RPAREN (no normalizer fusion needed)
    expect(result.tokens[0].type).toBe("OSRS_KEYWORD");
    // STRING token value includes quotes: '"Iron Axe"'
    expect(result.tokens[2].type).toBe("STRING");

    // Bytecode: PUSH_STRING("Iron Axe") + CALL_PLUGIN + fnIdx + argCount
    expect(result.program.opcodes[0]).toBe(OpCode.PUSH_STRING);
    expect(result.program.opcodes[2]).toBe(OpCode.CALL_PLUGIN);
    expect(result.program.opcodes[3]).toBe(OSRS_PLUGIN_FN_IDX);
    expect(result.program.opcodes[4]).toBe(1);
    // String value should be stripped of quotes
    expect(result.program.strings[0]).toBe("Iron Axe");

    // gp value from cache
    expect(result.value.unit).toBe("gp");
    expect(Math.abs(Number(result.value.value) - 412)).toBeLessThanOrEqual(1);

    engine.clear();
  });

  test("evaluates osrs(\"Abyssal Whip\") function-call syntax", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 4151, 82000, 81000);
    const result = engine.evaluateLineWithDebug(1, 'osrs("Abyssal Whip")');

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    expect(Number(result.value.value)).toBeGreaterThan(80000);
    expect(result.program.strings[0]).toBe("Abyssal Whip");

    engine.clear();
  });

  test("evaluates price(\"Dragon Hide\") function-call syntax", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1745, 2100, 2000);
    const result = engine.evaluateLineWithDebug(1, 'price("Dragon Hide")');

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    expect(Number(result.value.value)).toBeGreaterThan(2000);
    expect(result.program.strings[0]).toBe("Dragon Hide");

    engine.clear();
  });

  test("ge(\"Iron Axe\") + ge(\"Dragon Hide\") arithmetic with function-call syntax", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    seedPrice(engine.queryClient, 1745, 2100, 2000);
    const result = engine.evaluateLineWithDebug(1, 'ge("Iron Axe") + ge("Dragon Hide")');

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    // Iron Axe ≈ 412 + Dragon Hide ≈ 2050 = ≈ 2462
    expect(Number(result.value.value)).toBeGreaterThan(2400);
    expect(Number(result.value.value)).toBeLessThan(2500);

    engine.clear();
  });

  test("evaluates 'osrs price of Iron Axe' filler word path through engine", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    const result = engine.evaluateLineWithDebug(1, "osrs price of Iron Axe");

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    // Iron Axe midPrice ≈ 412
    expect(Math.abs(Number(result.value.value) - 412)).toBeLessThanOrEqual(1);
    expect(result.program.strings[0]).toBe("Iron Axe");

    engine.clear();
  });

  test("evaluates 'osrs price Iron Axe' filler word path (no 'of')", () => {
    const engine = createEngineWithOsrs();
    clearSeededPrices(engine.queryClient);
    seedPrice(engine.queryClient, 1267, 423, 400);
    const result = engine.evaluateLineWithDebug(1, "osrs price Iron Axe");

    expect(result.error).toBeUndefined();
    expect(result.value.unit).toBe("gp");
    expect(Math.abs(Number(result.value.value) - 412)).toBeLessThanOrEqual(1);

    engine.clear();
  });
});
