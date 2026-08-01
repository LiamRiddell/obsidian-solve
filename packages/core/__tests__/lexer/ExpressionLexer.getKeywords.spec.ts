import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";
import type { LexerVocabulary } from "@solve-js/lexer/ExpressionLexer";
import { Lexer } from "@solve-js/lexer/Lexer";

/**
 * getKeywords() is the completions feature's one genuinely new engine-level
 * surface: a snapshot of every keyword the lexer currently recognizes
 * (locale + any plugin-contributed ones), word -> token type. Everything
 * else completions needs (units, functions-as-keywords, variables) already
 * had a public accessor before this.
 */
describe("ExpressionLexer.getKeywords()", () => {
  test("includes English builtins mapped to their token type", () => {
    const lexer = new ExpressionLexer("en");
    const keywords = lexer.getKeywords();
    expect(keywords.pi).toBe("PI");
    expect(keywords.sqrt).toBe("FUNC");
    expect(keywords.convert).toBe("CONVERT");
  });

  test("a registered plugin's custom keyword appears, and disappears after unregisterVocabulary", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = { keywords: { osrs: "OSRS_KEYWORD" } };

    expect(lexer.getKeywords().osrs).toBeUndefined();

    lexer.registerVocabulary(plugin);
    expect(lexer.getKeywords().osrs).toBe("OSRS_KEYWORD");

    lexer.unregisterVocabulary(plugin);
    expect(lexer.getKeywords().osrs).toBeUndefined();
  });

  test("returns a snapshot copy, not a live reference — mutating it doesn't affect the lexer", () => {
    const lexer = new ExpressionLexer("en");
    const keywords = lexer.getKeywords();
    keywords.pi = "SOMETHING_ELSE";
    expect(lexer.getKeywords().pi).toBe("PI");
  });
});

describe("Lexer.getKeywords()", () => {
  test("delegates to the underlying ExpressionLexer", () => {
    const lexer = new Lexer("en");
    const keywords = lexer.getKeywords();
    expect(keywords.pi).toBe("PI");
    expect(keywords.sqrt).toBe("FUNC");
  });
});
