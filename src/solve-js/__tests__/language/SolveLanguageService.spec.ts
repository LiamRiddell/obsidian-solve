import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { SolveLanguageService } from "@solve-js/language/SolveLanguageService";

describe("SolveLanguageService", () => {
  let engine: ExpressionEngine;
  let service: SolveLanguageService;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
    service = new SolveLanguageService(engine);
  });

  test("simple expression 1 + 2 produces 3 tokens: number, operator, number", () => {
    const tokens = service.getSemanticTokens("1 + 2", 1);
    expect(tokens).toHaveLength(3);
    expect(tokens[0].category).toBe("number");
    expect(tokens[1].category).toBe("operator");
    expect(tokens[2].category).toBe("number");
    expect(tokens[0].from).toBe(0);
    expect(tokens[0].to).toBe(1);
    expect(tokens[1].from).toBe(2);
    expect(tokens[1].to).toBe(3);
    expect(tokens[2].from).toBe(4);
    expect(tokens[2].to).toBe(5);
  });

  test("keyword pi produces a keyword token", () => {
    const tokens = service.getSemanticTokens("pi", 1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].category).toBe("keyword");
    expect(tokens[0].from).toBe(0);
    expect(tokens[0].to).toBe(2);
  });

  test("function call sqrt(4) highlights function, punctuation, and number", () => {
    const tokens = service.getSemanticTokens("sqrt(4)", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    const funcRange = tokens.find(r => r.category === "function");
    const numRange = tokens.find(r => r.category === "number");
    expect(funcRange).toBeDefined();
    expect(numRange).toBeDefined();
    expect(funcRange!.from).toBe(0);
    expect(funcRange!.to).toBe(4);
  });

  test("unbalanced braces {{{ still highlights as punctuation (lexed, not parsed)", () => {
    // Highlighting is a lexical concern, not a parse-success one: three
    // LBRACE characters are three perfectly valid tokens at the lexer
    // level, even though they'd never form parseable syntax. This is the
    // "only highlight things recognized by the grammar" contract in
    // practice — recognized by the lexer's grammar, not by a successful
    // parse or evaluation.
    const tokens = service.getSemanticTokens("{{{", 1);
    expect(tokens).toHaveLength(3);
    expect(tokens.every(t => t.category === "punctuation")).toBe(true);
  });

  test("variable :x highlights COLON as variable", () => {
    const tokens = service.getSemanticTokens(":x", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    const colonRange = tokens.find(r => r.category === "variable");
    expect(colonRange).toBeDefined();
    expect(colonRange!.from).toBe(0);
    expect(colonRange!.to).toBe(1);
  });

  test("dollar with currency parselet produces a variable token", () => {
    const tokens = service.getSemanticTokens("$x", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].category).toBe("variable");
    expect(tokens[0].from).toBe(0);
    expect(tokens[0].to).toBe(1);
  });

  test("unparseable text still classifies each recognized lexical token", () => {
    // "invalid" lexes as a bare IDENT (variable category — recognized
    // grammar, undefined-ness is an eval-time concern) followed by 6
    // punctuation tokens. Never parses successfully, but every character
    // here is still individually recognized by the lexer.
    const tokens = service.getSemanticTokens("invalid {{{ }}}", 1);
    expect(tokens).toHaveLength(7);
    expect(tokens[0].category).toBe("variable");
    expect(tokens.slice(1).every(t => t.category === "punctuation")).toBe(true);
  });

  test("padding/whitespace: '  1 + 2' has correct offset mapping", () => {
    const tokens = service.getSemanticTokens("  1 + 2", 1);
    expect(tokens).toHaveLength(3);
    expect(tokens[0].from).toBe(2);
    expect(tokens[0].to).toBe(3);
    expect(tokens[1].from).toBe(4);
    expect(tokens[1].to).toBe(5);
    expect(tokens[2].from).toBe(6);
    expect(tokens[2].to).toBe(7);
  });

  test("multiple operators highlighted correctly", () => {
    const tokens = service.getSemanticTokens("3 + 4 * 5", 1);
    expect(tokens).toHaveLength(5);
    expect(tokens[0].category).toBe("number");
    expect(tokens[1].category).toBe("operator");
    expect(tokens[2].category).toBe("number");
    expect(tokens[3].category).toBe("operator");
    expect(tokens[4].category).toBe("number");
  });

  test("parenthesized expression highlights correctly", () => {
    const tokens = service.getSemanticTokens("(1 + 2)", 1);
    // punctuation (parens) now also produces tokens, unlike the old
    // className-based map which left LPAREN/RPAREN unstyled.
    expect(tokens).toHaveLength(5);
    expect(tokens[0].category).toBe("punctuation"); // (
    expect(tokens[1].category).toBe("number");
    expect(tokens[2].category).toBe("operator");
    expect(tokens[3].category).toBe("number");
    expect(tokens[4].category).toBe("punctuation"); // )
  });

  test("pi keyword with assignment parses as variable write", () => {
    const tokens = service.getSemanticTokens(":x = pi", 1);
    // COLON(variable) IDENT("x", variable) EQUALS(operator) PI(keyword)
    expect(tokens).toHaveLength(4);
    expect(tokens[0].category).toBe("variable"); // :
    expect(tokens[1].category).toBe("variable"); // x
    expect(tokens[2].category).toBe("operator"); // =
    expect(tokens[3].category).toBe("keyword"); // pi
  });

  test("inline solve expression s`1 + 2` is tokenized correctly", () => {
    const tokens = service.getSemanticTokens("s`1 + 2`", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const numberTokens = tokens.filter(r => r.category === "number");
    const operatorTokens = tokens.filter(r => r.category === "operator");
    expect(numberTokens.length).toBeGreaterThanOrEqual(2);
    expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
  });

  test("inline solve expression with multiple operations", () => {
    const tokens = service.getSemanticTokens("s`1 + 2 * 3`", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(5);
    const numberTokens = tokens.filter(r => r.category === "number");
    const operatorTokens = tokens.filter(r => r.category === "operator");
    expect(numberTokens.length).toBeGreaterThanOrEqual(3);
    expect(operatorTokens.length).toBeGreaterThanOrEqual(2);
  });

  test("inline solve expression with function call", () => {
    const tokens = service.getSemanticTokens("s`sqrt(4)`", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    const funcRange = tokens.find(r => r.category === "function");
    const numRange = tokens.find(r => r.category === "number");
    expect(funcRange).toBeDefined();
    expect(numRange).toBeDefined();
  });

  test("markdown list marker is filtered out", () => {
    const tokens = service.getSemanticTokens("- 1 + 2", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const numberTokens = tokens.filter(r => r.category === "number");
    const operatorTokens = tokens.filter(r => r.category === "operator");
    expect(numberTokens.length).toBeGreaterThanOrEqual(2);
    expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
  });

  test("markdown heading marker is filtered out", () => {
    const tokens = service.getSemanticTokens("# Heading", 1);
    expect(tokens).toHaveLength(0);
  });

  test("blockquote marker is filtered out", () => {
    const tokens = service.getSemanticTokens("> 1 + 2", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const numberTokens = tokens.filter(r => r.category === "number");
    const operatorTokens = tokens.filter(r => r.category === "operator");
    expect(numberTokens.length).toBeGreaterThanOrEqual(2);
    expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
  });

  describe("no engine provided", () => {
    test("returns no tokens rather than throwing", () => {
      const bareService = new SolveLanguageService();
      expect(bareService.getSemanticTokens("1 + 2", 1)).toEqual([]);
    });
  });

  describe("caching", () => {
    test("caches results for repeated calls on the same line/text", () => {
      const first = service.getSemanticTokens("1 + 2", 1);
      const second = service.getSemanticTokens("1 + 2", 1);
      expect(first).toBe(second); // same array reference — genuine cache hit, not just deep-equal
    });

    test("a cache hit does not re-invoke the lexer", () => {
      service.getSemanticTokens("1 + 2", 1);
      const lexer = engine.getLexer();
      const spy = jest.spyOn(lexer, "getHighlightTokens");
      service.getSemanticTokens("1 + 2", 1);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test("changed text on the same line invalidates that line's cache entry (cheap overwrite, not a leak)", () => {
      const first = service.getSemanticTokens("1 + 2", 5);
      const second = service.getSemanticTokens("10 + 20", 5); // same line number, different text
      expect(second).not.toBe(first);
      expect(second[0].to - second[0].from).toBe(2); // "10"
    });

    test("invalidateLines evicts only the named lines — others still hit cache", () => {
      service.getSemanticTokens("1 + 2", 1);
      service.getSemanticTokens("3 + 4", 2);
      const untouchedFirst = service.getSemanticTokens("1 + 2", 1);

      service.invalidateLines([2]);

      const lexer = engine.getLexer();
      const spy = jest.spyOn(lexer, "getHighlightTokens");
      const stillCachedLine1 = service.getSemanticTokens("1 + 2", 1);
      expect(spy).not.toHaveBeenCalled(); // line 1 was never invalidated
      expect(stillCachedLine1).toBe(untouchedFirst);

      service.getSemanticTokens("3 + 4", 2); // line 2 WAS invalidated — must re-lex
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    test("invalidateCache clears every line", () => {
      service.getSemanticTokens("1 + 2", 1);
      service.invalidateCache();
      const after = service.getSemanticTokens("1 + 2", 1);
      expect(after).toEqual([
        { from: 0, to: 1, category: "number" },
        { from: 2, to: 3, category: "operator" },
        { from: 4, to: 5, category: "number" },
      ]);
    });

    test("bounded size: does not grow without limit across many distinct lines", () => {
      // Push well past MAX_CACHED_LINES worth of distinct line numbers —
      // this must not throw, hang, or (this is the point) retain every
      // entry forever. We can't reach into the private cache directly, so
      // this is a smoke test that eviction doesn't break correctness: the
      // most-recently-set lines must still be cache hits.
      for (let i = 0; i < 2500; i++) {
        service.getSemanticTokens(`${i} + 1`, i);
      }
      const lexer = engine.getLexer();
      const spy = jest.spyOn(lexer, "getHighlightTokens");
      service.getSemanticTokens("2499 + 1", 2499); // most recently inserted — should still be cached
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
