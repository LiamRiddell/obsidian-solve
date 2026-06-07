import type { LexerPlugin } from "@solve-js/lexer/ExpressionLexer";

export const osrsLexerPlugin: LexerPlugin = {
  keywords: {
    osrs: "OSRS_KEYWORD",
    ge: "OSRS_KEYWORD",
    price: "OSRS_KEYWORD",
  },
};
