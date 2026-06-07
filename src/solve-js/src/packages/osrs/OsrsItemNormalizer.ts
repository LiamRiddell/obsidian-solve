import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { OsrsItemTrie } from "./OsrsItemTrie";
import { OSRS_ITEMS } from "./OsrsItemVocabulary";

export const GAME_ITEM_TYPE = "GAME_ITEM";
export const GAME_ITEM_TYPE_ID = tokenTypeId(GAME_ITEM_TYPE);

/**
 * NormalizerRule that fuses consecutive IDENT tokens matching OSRS item names
 * into a single GAME_ITEM token. Priority 60 runs before implicit multiply (50).
 */
export function osrsItemNormalizerRule(
  customItems?: typeof OSRS_ITEMS,
): NormalizerRule {
  const trie = new OsrsItemTrie(customItems ?? OSRS_ITEMS);

  return {
    name: "osrs:item-fusion",
    priority: 60,
    match(tokens: Token[], pos: number): NormalizerMatch | null {
      if (pos >= tokens.length) return null;
      if (tokens[pos].type !== "IDENT") return null;

      const match = trie.longestMatch(tokens, pos);
      if (!match) return null;

      const firstToken = tokens[pos];
      const sourceTokens = tokens.slice(pos, pos + match.wordCount);
      const fusedToken = new LexerToken(
        GAME_ITEM_TYPE,
        GAME_ITEM_TYPE_ID,
        match.item.name,
        match.item.name,
        firstToken.offset,
        0,
        firstToken.line,
        firstToken.col,
      );

      return {
        consumed: match.wordCount,
        replacement: [fusedToken],
        ruleName: "osrs:item-fusion",
      };
    },
  };
}
