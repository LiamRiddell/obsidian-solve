import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { LanguageService } from "@solve-js/language/LanguageService";
import { OSRS_PACKAGE } from "@solve-js-examples/osrs/OsrsPackage";

describe("LanguageService", () => {
  let engine: ExpressionEngine;
  let service: LanguageService;

  beforeEach(() => {
    engine = new ExpressionEngine("en", false);
    service = new LanguageService(engine);
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

  test("unbalanced braces {{{ produce no tokens — lexes fine, never parses", () => {
    // Three LBRACE characters are three perfectly valid tokens at the
    // lexer level, but never form parseable syntax. Highlighting requires
    // the line to actually parse (see the class doc comment) — lexing
    // alone is not "recognized".
    const tokens = service.getSemanticTokens("{{{", 1);
    expect(tokens).toHaveLength(0);
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

  test("unparseable text produces no tokens even though every word individually lexes", () => {
    // "invalid" lexes as a bare IDENT and each brace lexes as valid
    // punctuation, but the line as a whole never parses — so nothing
    // highlights. This is the regression case for a real bug: plain
    // English prose ("My name is ron weasily") lexes into a stream of
    // individually-valid IDENT tokens with no grammar tying them together,
    // and used to get colored as if it were code.
    const tokens = service.getSemanticTokens("invalid {{{ }}}", 1);
    expect(tokens).toHaveLength(0);
  });

  test("plain English prose produces no tokens (regression: was highlighted as code)", () => {
    const tokens = service.getSemanticTokens("My name is ron weasily", 1);
    expect(tokens).toHaveLength(0);
  });

  test("a lone bare word with no other appearance in the document produces no tokens", () => {
    // Regression: a single stray word ("hello") technically parses as a
    // bare-identifier-reference expression, same as any real variable
    // would — but it's exactly as ambiguous as a five-word sentence, just
    // one token instead of five. Only highlight it once it's an actual
    // variable used elsewhere in the document (see the next two tests).
    const tokens = service.getSemanticTokens("hello", 1);
    expect(tokens).toHaveLength(0);
  });

  test("a lone bare word's cached result stays live across a DAG change on ANOTHER line, without invalidateLines", () => {
    // Regression: caught live in the playground. Line 7 ("hello") got
    // cached as "not a known variable" (empty tokens) BEFORE line 5
    // defined ":hello = 1" — and because line 7's own text never changed,
    // nothing ever called invalidateLines(7), so the stale "unknown"
    // result stuck around even after "hello" became a real variable.
    // The fix must re-check DAG membership on every call, cache hit or
    // not — never bake the DAG-dependent verdict into the cached entry.
    expect(service.getSemanticTokens("hello", 7)).toHaveLength(0); // cached as empty here
    engine.evaluateLine(5, ":hello = 1"); // DAG changes; line 7's own text/cache entry is untouched
    expect(service.getSemanticTokens("hello", 7)).toHaveLength(1); // must reflect the new DAG state anyway
  });

  test("a lone bare word DOES highlight once it's a known variable elsewhere in the document", () => {
    engine.evaluateLine(1, ":revenue = 100");
    const tokens = service.getSemanticTokens("revenue", 2);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].category).toBe("variable");
  });

  test("sigil-marked variables (:x, $x) highlight regardless of DAG state — unaffected by the bare-word gate", () => {
    expect(service.getSemanticTokens(":x", 1).length).toBeGreaterThanOrEqual(1);
    expect(service.getSemanticTokens("$x", 1).length).toBeGreaterThanOrEqual(1);
  });

  test("a custom variableNameSource is used instead of the engine's own DAG for the bare-word gate", () => {
    const custom = new LanguageService(engine, { variableNameSource: () => ["totallyMadeUp"] });
    expect(custom.getSemanticTokens("totallyMadeUp", 1)).toHaveLength(1);
    expect(custom.getSemanticTokens("somethingElse", 2)).toHaveLength(0);
  });

  test("inline solve embedded in prose only highlights the expression, not the surrounding text", () => {
    const tokens = service.getSemanticTokens("The total is s`1 + 2` today", 1);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const numberTokens = tokens.filter(r => r.category === "number");
    const operatorTokens = tokens.filter(r => r.category === "operator");
    expect(numberTokens.length).toBeGreaterThanOrEqual(2);
    expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
    // "The", "total", "is", "today" are prose IDENTs outside the marker —
    // none should be classified as a variable.
    expect(tokens.some(r => r.category === "variable")).toBe(false);
  });

  test("an inline solve with unparseable content highlights nothing", () => {
    const tokens = service.getSemanticTokens("Notes: s`not an expr` end", 1);
    expect(tokens).toHaveLength(0);
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
      const bareService = new LanguageService();
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

  describe("getCompletions", () => {
    test("prefix 'sq' includes sqrt as a function", () => {
      const items = service.getCompletions("sq", 2);
      const sqrt = items.find(i => i.label === "sqrt");
      expect(sqrt).toBeDefined();
      expect(sqrt!.category).toBe("function");
    });

    test("prefix 'p' includes pi (keyword) and plus (operator)", () => {
      const items = service.getCompletions("p", 1);
      expect(items.some(i => i.label === "pi" && i.category === "keyword")).toBe(true);
      expect(items.some(i => i.label === "plus" && i.category === "operator")).toBe(true);
    });

    test("prefix 'k' includes unit candidates", () => {
      const items = service.getCompletions("k", 1);
      expect(items.some(i => i.category === "unit")).toBe(true);
    });

    test("a variable written on one line appears as a completion when its prefix is typed on another", () => {
      engine.evaluateLine(1, ":myvar = 5");
      const items = service.getCompletions("my", 2);
      expect(items.some(i => i.label === "myvar" && i.category === "variable")).toBe(true);
    });

    test("empty prefix (cursor right after whitespace/operator) returns no completions", () => {
      expect(service.getCompletions("10 + ", 5)).toHaveLength(0);
      expect(service.getCompletions("", 0)).toHaveLength(0);
    });

    test("no engine provided returns no completions, no throw", () => {
      const bareService = new LanguageService();
      expect(bareService.getCompletions("sq", 2)).toEqual([]);
    });

    test("OSRS's keywords (osrs, ge, price) appear once the package is registered", () => {
      // OSRS ships in BUILTIN_PACKAGES (registered by default on `engine`
      // from beforeEach) — construct a package-free engine here so
      // register/unregister is a clean, isolated before/after, matching
      // PackageUnregistration.spec.ts's existing pattern for this.
      const isolatedEngine = new ExpressionEngine("en", false, undefined, undefined, []);
      const isolatedService = new LanguageService(isolatedEngine);
      expect(isolatedService.getCompletions("os", 2).some(i => i.label === "osrs")).toBe(false);

      isolatedEngine.registerPackage(OSRS_PACKAGE);
      isolatedService.invalidateCache();
      expect(isolatedService.getCompletions("os", 2).some(i => i.label === "osrs")).toBe(true);
      expect(isolatedService.getCompletions("g", 1).some(i => i.label === "ge")).toBe(true);
    });

    test("OSRS's completionItems (item names) appear once registered and vanish after unregisterPackage", () => {
      const isolatedEngine = new ExpressionEngine("en", false, undefined, undefined, []);
      const isolatedService = new LanguageService(isolatedEngine);

      isolatedEngine.registerPackage(OSRS_PACKAGE);
      isolatedService.invalidateCache();
      expect(isolatedService.getCompletions("iron", 1).some(i => i.label === "Iron Axe" && i.category === "osrs-item")).toBe(true);

      isolatedEngine.unregisterPackage("osrs");
      isolatedService.invalidateCache(); // static candidates are cached — must be told the package list changed
      expect(isolatedService.getCompletions("iron", 1).some(i => i.label === "Iron Axe")).toBe(false);
    });

    test("a custom variableNameSource is used instead of the engine's own DAG", () => {
      const custom = new LanguageService(engine, { variableNameSource: () => ["customVar"] });
      expect(custom.getCompletions("cust", 1).some(i => i.label === "customVar")).toBe(true);
    });

    test("results are capped and variables are ranked ahead of keywords/units", () => {
      engine.evaluateLine(1, ":pizza = 1"); // shares the "pi" prefix with the keyword "pi"
      const items = service.getCompletions("pi", 2);
      const pizzaIndex = items.findIndex(i => i.label === "pizza");
      const piIndex = items.findIndex(i => i.label === "pi");
      expect(pizzaIndex).toBeGreaterThanOrEqual(0);
      expect(piIndex).toBeGreaterThanOrEqual(0);
      expect(pizzaIndex).toBeLessThan(piIndex);
    });

    test("static keyword/unit candidates are memoized and rebuilt only after invalidateCache", () => {
      const lexer = engine.getLexer();
      service.getCompletions("sq", 1);
      const spy = jest.spyOn(lexer, "getKeywords");
      service.getCompletions("sq", 1);
      expect(spy).not.toHaveBeenCalled();
      service.invalidateCache();
      service.getCompletions("sq", 1);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
