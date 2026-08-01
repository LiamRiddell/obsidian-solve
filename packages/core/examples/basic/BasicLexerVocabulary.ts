import type { LexerVocabulary } from "@solve-js/lexer/ExpressionLexer";

/** Registers `reverse` as a recognized keyword token rather than a generic identifier. */
export const basicLexerVocabulary: LexerVocabulary = {
  keywords: {
    reverse: "REVERSE_KEYWORD",
  },
};
