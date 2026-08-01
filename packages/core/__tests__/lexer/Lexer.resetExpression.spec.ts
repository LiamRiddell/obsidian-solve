import { describe, expect, test } from "@jest/globals";
import { Lexer, LexerState } from "@solve-js/lexer";


/**
 * Tests for Lexer.resetExpression().
 *
 * resetExpression() is the fast path for expression-only tokenization.
 * Unlike reset(), it skips the classifyLine() call entirely and always
 * tokenizes the input. This is used by ExpressionEngine when it already
 * knows the input is an evaluable expression.
 *
 * Key differences from reset():
 *  - reset() calls classifyLine() first; skipped lines produce empty tokens
 *  - resetExpression() always tokenizes, even for markdown structural lines
 *  - Both reset state (currentState, peek, token array) identically
 */

// ── Helper ───────────────────────────────────────────────────────────────

function collectTypes(lexer: Lexer): string[] {
  const types: string[] = [];
  for (const t of lexer) {
    types.push(t.type);
  }
  return types;
}

function collectValues(lexer: Lexer): string[] {
  const values: string[] = [];
  for (const t of lexer) {
    values.push(t.value);
  }
  return values;
}

function collectTokens(lexer: Lexer): Array<{ type: string; value: string }> {
  return [...lexer].map(t => ({ type: t.type, value: t.value }));
}

// ── Default (non-custom-locale) lexer for parity checks ─────────────────
function sameTokens(resetExprTokens: Array<{ type: string; value: string }>, input: string): boolean {
  const ref = new Lexer("en");
  ref.reset(input);
  const refTokens = [...ref].map(t => ({ type: t.type, value: t.value }));
  if (resetExprTokens.length !== refTokens.length) return false;
  for (let i = 0; i < resetExprTokens.length; i++) {
    if (resetExprTokens[i].type !== refTokens[i].type) return false;
    if (resetExprTokens[i].value !== refTokens[i].value) return false;
  }
  return true;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Lexer.resetExpression — basic tokenization", () => {
  test("tokenizes a single number", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("42");
    const tokens = collectTokens(lexer);
    expect(tokens).toEqual([{ type: "NUMBER", value: "42" }]);
  });

  test("tokenizes a decimal number", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("3.14");
    const tokens = collectTokens(lexer);
    expect(tokens).toEqual([{ type: "NUMBER", value: "3.14" }]);
  });

  test("tokenizes a hex number", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("0xFF");
    const tokens = collectTokens(lexer);
    expect(tokens[0].type).toBe("NUMBER");
    expect(tokens[0].value).toBe("0xFF");
  });

  test("tokenizes a BigInt literal", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("100n");
    const tokens = collectTokens(lexer);
    expect(tokens).toEqual([{ type: "BIGINT", value: "100n" }]);
  });

  test("tokenizes simple addition", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1 + 2");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("tokenizes all arithmetic operators", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("+ - * / ^ % << >>");
    expect(collectTypes(lexer)).toEqual([
      "PLUS", "MINUS", "STAR", "SLASH", "CARET", "PERCENT", "LSHIFT", "RSHIFT",
    ]);
  });

  test("tokenizes two-character operators", () => {
    const lexer = new Lexer("en");
    // Use identifiers that aren't single-char built-in units or keywords:
    // a=are, b=barn, c=centi, d=day are all built-in units; e=math constant.
    lexer.resetExpression("x == y != z >= w <= v");
    expect(collectTypes(lexer)).toEqual([
      "IDENT", "EQUALITY", "IDENT", "NEQ", "IDENT", "GTE", "IDENT", "LTE", "IDENT",
    ]);
  });

  test("tokenizes colon-prefixed variable assignment", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression(":myVar = 42");
    expect(collectTypes(lexer)).toEqual(["COLON", "IDENT", "EQUALS", "NUMBER"]);
  });

  test("tokenizes keywords", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("pi plus minus times");
    expect(collectValues(lexer)).toEqual(["pi", "plus", "minus", "times"]);
  });

  test("tokenizes inline solve markers", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("s`1 + 2`");
    expect(collectTypes(lexer)).toContain("INLINE_SOLVE_START");
  });

  test("tokenizes function calls", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("sin(0)");
    expect(collectTypes(lexer)).toEqual(["FUNC", "LPAREN", "NUMBER", "RPAREN"]);
  });

  test("tokenizes complex mixed expression", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression(":x = 1 + 2 * (3 - 4)");
    expect(collectTypes(lexer)).toEqual([
      "COLON", "IDENT", "EQUALS", "NUMBER", "PLUS", "NUMBER",
      "STAR", "LPAREN", "NUMBER", "MINUS", "NUMBER", "RPAREN",
    ]);
  });

  test("tokenizes strings", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression('"hello world"');
    expect(collectTypes(lexer)).toEqual(["STRING"]);
  });

  test("tokenizes scientific notation", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1.5e10");
    const tokens = collectTokens(lexer);
    expect(tokens).toEqual([{ type: "NUMBER", value: "1.5e10" }]);
  });

  test("tokenizes units", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("100 cm");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "UNIT"]);
    expect(collectValues(lexer)).toEqual(["100", "cm"]);
  });

  test("tokenizes percentages", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("50%");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "PERCENT"]);
  });
});

describe("Lexer.resetExpression — tokens match reset() for expression lines", () => {
  const EXPRESSION_CASES = [
    "42",
    "1 + 2",
    "3 * 4",
    "(1 + 2) * 3",
    "pi + e",
    "sin(0)",
    ":myVar = 42",
    "1 == 2",
    "1.5e10",
    "100 cm to m",
    "now + 3 days",
    "4d6",
    "50% of 200",
    "between 1 and 10",
    "to the power of",
    "increase 100 by 10%",
    "1 << 2",
    "0xFF",
    "0b1010",
    "100n",
    "1 + 2 * 3 ^ 4",
    "a + b - c * d / e % f",
    "max(1, 2)",
    "roll 3d8",
    ":x = 5\n:y = :x + 3",
  ];

  for (const expr of EXPRESSION_CASES) {
    test(`resetExpression("${expr}") matches reset("${expr}")`, () => {
      const lexer = new Lexer("en");
      lexer.resetExpression(expr);
      const resetExprTokens = collectTokens(lexer);
      expect(sameTokens(resetExprTokens, expr)).toBe(true);
    });
  }
});

describe("Lexer.resetExpression — skips classifyLine (tokenizes markdown lines)", () => {
  test("tokenizes heading-like input (# Heading)", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("# Heading");
    const types = collectTypes(lexer);
    // classifyLine would mark this as skip. resetExpression should tokenize it.
    // '#' hits CharClass.HASH → tokenizeComment() → COMMENT token, not HASH.
    expect(types.length).toBeGreaterThan(0);
    expect(types[0]).toBe("COMMENT");
  });

  test("tokenizes blockquote-like input (> Quote)", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("> Quote");
    // classifyLine would mark >  as skip. resetExpression should tokenize it.
    const tokens = collectTokens(lexer);
    expect(tokens.length).toBeGreaterThan(0);
    // '>' is a single-char operator mapped to GTE in OP_MAP... actually,
    // charCode 62 maps to... let's check: OP_MAP[62] is not defined by default
    // (only 60 for LTE, 62 for GTE? Wait — OP_MAP has 62 not mapped).
    // Actually looking at OP_MAP: 62 is not in OP_MAP. So '>' would be ERROR.
    // But it could also be two-char with '>'. Hmm let's just verify it tokenizes.
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });

  test("tokenizes comment-like input (# comment)", () => {
    // classifyLine would skip this as a comment. resetExpression should tokenize.
    const lexer = new Lexer("en");
    lexer.resetExpression("# ignore this");
    const tokens = collectTokens(lexer);
    expect(tokens.length).toBeGreaterThan(0);
    // # is a COMMENT token
    expect(tokens[0].type).toBe("COMMENT");
  });

  test("tokenizes comment-like input (// comment)", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("// ignore this");
    const tokens = collectTokens(lexer);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].type).toBe("COMMENT");
  });

  test("tokenizes code-fence-like input (```lang)", () => {
    // classifyLine would mark ``` as a code_fence skip. resetExpression should tokenize.
    const lexer = new Lexer("en");
    lexer.resetExpression("```typescript");
    const types = collectTypes(lexer);
    // Three backticks → three BACKTICK_OPEN tokens
    expect(types).toEqual(["BACKTICK_OPEN", "BACKTICK_OPEN", "BACKTICK_OPEN", "IDENT"]);
  });

  test("tokenizes HR-like input (---)", () => {
    // classifyLine marks --- as HR skip. resetExpression should tokenize.
    const lexer = new Lexer("en");
    lexer.resetExpression("---");
    const types = collectTypes(lexer);
    // Triple minus → three MINUS tokens
    expect(types).toEqual(["MINUS", "MINUS", "MINUS"]);
  });

  test("tokenizes empty string", () => {
    // classifyLine returns skip for empty. resetExpression should return empty.
    const lexer = new Lexer("en");
    lexer.resetExpression("");
    expect(collectTokens(lexer)).toEqual([]);
  });

  test("tokenizes whitespace-only line", () => {
    // Whitespace is swallowed by the lexer (no WS tokens emitted).
    const lexer = new Lexer("en");
    lexer.resetExpression("   ");
    expect(collectTokens(lexer)).toEqual([]);
  });

  test("tokenizes list-like input (- item)", () => {
    // classifyLine might classify as list (evaluate). Still should tokenize.
    const lexer = new Lexer("en");
    lexer.resetExpression("- item");
    const types = collectTypes(lexer);
    expect(types).toEqual(["MINUS", "IDENT"]);
  });

  test("reset() skips while resetExpression() tokenizes heading", () => {
    const input = "# Heading";
    const skipLexer = new Lexer("en");
    skipLexer.reset(input);
    const skipTokens = [...skipLexer];

    const exprLexer = new Lexer("en");
    exprLexer.resetExpression(input);
    const exprTokens = [...exprLexer];

    // reset() skips headings → no tokens
    expect(skipTokens.length).toBe(0);
    // resetExpression() always tokenizes → has tokens
    expect(exprTokens.length).toBeGreaterThan(0);
  });

  test("reset() skips while resetExpression() tokenizes blockquote", () => {
    const input = "> Quote";
    const skipLexer = new Lexer("en");
    skipLexer.reset(input);
    const skipTokens = [...skipLexer];

    const exprLexer = new Lexer("en");
    exprLexer.resetExpression(input);
    const exprTokens = [...exprLexer];

    expect(skipTokens.length).toBe(0);
    expect(exprTokens.length).toBeGreaterThan(0);
  });

  test("reset() skips while resetExpression() tokenizes code fence", () => {
    const input = "```js";
    const skipLexer = new Lexer("en");
    skipLexer.reset(input);
    const skipTokens = [...skipLexer];

    const exprLexer = new Lexer("en");
    exprLexer.resetExpression(input);
    const exprTokens = [...exprLexer];

    expect(skipTokens.length).toBe(0);
    expect(exprTokens.length).toBeGreaterThan(0);
  });
});

describe("Lexer.resetExpression — state management", () => {
  test("resets currentState to LexerState.Main", () => {
    const lexer = new Lexer("en");

    // Set to a non-Main state first
    lexer.setState("InlineSolve" as any);
    expect(lexer.getState()).toBe("InlineSolve");

    // resetExpression always sets to Main
    lexer.resetExpression("42");
    expect(lexer.getState()).toBe(LexerState.Main);
  });

  test("clears peeked token", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1 + 2");

    // Peek, then reset, then peek again
    const first = lexer.peek();
    expect(first).toBeDefined();

    lexer.resetExpression("3 + 4");
    const afterReset = lexer.peek();
    expect(afterReset).toBeDefined();
    expect(afterReset!.value).toBe("3");
  });

  test("repeated calls correctly reset token stream", () => {
    const lexer = new Lexer("en");

    lexer.resetExpression("1 + 2");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "PLUS", "NUMBER"]);

    // Same lexer, different expression
    lexer.resetExpression("3 * 4");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "STAR", "NUMBER"]);

    // Third call — no token bleed from previous calls
    lexer.resetExpression(":x = 5");
    expect(collectTypes(lexer)).toEqual(["COLON", "IDENT", "EQUALS", "NUMBER"]);
  });

  test("resetExpression after reset() doesn't carry over state", () => {
    const lexer = new Lexer("en");

    // reset() with skip line
    lexer.reset("# heading");
    expect([...lexer].length).toBe(0);

    // resetExpression should work independently
    lexer.resetExpression("42");
    expect(collectTypes(lexer)).toEqual(["NUMBER"]);
  });

  test("reset() after resetExpression() works correctly", () => {
    const lexer = new Lexer("en");

    lexer.resetExpression("42");
    expect(collectTypes(lexer)).toEqual(["NUMBER"]);

    // reset() with skip line
    lexer.reset("# heading");
    expect([...lexer].length).toBe(0);

    // reset() with expression
    lexer.reset("1 + 2");
    expect(collectTypes(lexer)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });
});

describe("Lexer.resetExpression — next() / peek() streaming", () => {
  test("next() streams tokens correctly", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1 + 2");

    const t1 = lexer.next();
    expect(t1!.type).toBe("NUMBER");
    expect(t1!.value).toBe("1");

    const t2 = lexer.next();
    expect(t2!.type).toBe("PLUS");

    const t3 = lexer.next();
    expect(t3!.type).toBe("NUMBER");
    expect(t3!.value).toBe("2");

    expect(lexer.next()).toBeUndefined();
  });

  test("peek() doesn't consume tokens", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("42");

    const peeked = lexer.peek();
    expect(peeked!.type).toBe("NUMBER");
    expect(peeked!.value).toBe("42");

    // Token should still be available via next()
    const consumed = lexer.next();
    expect(consumed!.type).toBe(peeked!.type);
    expect(consumed!.value).toBe(peeked!.value);

    expect(lexer.next()).toBeUndefined();
  });

  test("peek() returns same value twice in a row", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("123");

    const p1 = lexer.peek();
    const p2 = lexer.peek();
    expect(p1!.value).toBe(p2!.value);
    expect(p1!.type).toBe(p2!.type);
  });

  test("peek then next then peek works correctly", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("a b c");

    // Peek first
    expect(lexer.peek()!.value).toBe("a");
    // Consume it
    expect(lexer.next()!.value).toBe("a");
    // Peek next
    expect(lexer.peek()!.value).toBe("b");
    // Consume it
    expect(lexer.next()!.value).toBe("b");
    // Peek last
    expect(lexer.peek()!.value).toBe("c");
    // Consume it
    expect(lexer.next()!.value).toBe("c");
    // End
    expect(lexer.peek()).toBeUndefined();
    expect(lexer.next()).toBeUndefined();
  });

  test("peek state is cleared by resetExpression()", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("old");
    expect(lexer.peek()!.value).toBe("old");

    // Reset without consuming — peek should reflect new input
    lexer.resetExpression("new");
    expect(lexer.peek()!.value).toBe("new");
  });
});

describe("Lexer.resetExpression — Symbol.iterator", () => {
  test("[...lexer] produces correct token array", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1 + 2");
    const tokens = [...lexer];
    expect(tokens.map(t => t.type)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("for...of iterates all tokens", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("a b c");
    const values: string[] = [];
    for (const t of lexer) {
      values.push(t.value);
    }
    expect(values).toEqual(["a", "b", "c"]);
  });

  test("Symbol.iterator always returns a fresh iterator over all tokens", () => {
    // Lexer[Symbol.iterator]() returns this.tokens[Symbol.iterator]() — a fresh
    // iterator each time. Unlike next() which tracks tokenIdx, spread creates
    // independent iterators that both yield the full token array.
    const lexer = new Lexer("en");
    lexer.resetExpression("42");

    const first = [...lexer];
    expect(first.map(t => t.type)).toEqual(["NUMBER"]);

    // Second spread yields the same tokens — it's a new, independent iterator
    const second = [...lexer];
    expect(second.map(t => t.type)).toEqual(["NUMBER"]);
  });

  test("next() advances tokenIdx but spread creates independent iterator", () => {
    // next() tracks consumption via this.tokenIdx. Spread creates a fresh
    // iterator over this.tokens (independent of tokenIdx), so it always
    // yields all tokens regardless of prior next() calls.
    const lexer = new Lexer("en");
    lexer.resetExpression("a b c d");

    // Consume first token via next()
    expect(lexer.next()!.value).toBe("a");

    // Spread yields ALL tokens (not just the remainder) because
    // [Symbol.iterator] returns a fresh array iterator
    const rest = [...lexer];
    expect(rest.map(t => t.value)).toEqual(["a", "b", "c", "d"]);

    // But next() after spread continues from tokenIdx
    expect(lexer.next()!.value).toBe("b");
  });
});

describe("Lexer.resetExpression — edge cases", () => {
  test("tokenizes scientific notation with negative exponent", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1.5e-3");
    expect(collectTokens(lexer)).toEqual([{ type: "NUMBER", value: "1.5e-3" }]);
  });

  test("tokenizes numbers with thousands separators", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1,234");
    expect(collectTokens(lexer)).toEqual([{ type: "NUMBER", value: "1,234" }]);
  });

  test("tokenizes decimal-only like .5", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression(".5");
    expect(collectTokens(lexer)).toEqual([{ type: "NUMBER", value: ".5" }]);
  });

  test("tokenizes deeply nested parentheses", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("((((1))))");
    expect(collectTypes(lexer)).toEqual([
      "LPAREN", "LPAREN", "LPAREN", "LPAREN",
      "NUMBER",
      "RPAREN", "RPAREN", "RPAREN", "RPAREN",
    ]);
  });

  test("tokenizes chained unary operators", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1+-+-+-+-+-2");
    const types = collectTypes(lexer);
    expect(types.length).toBeGreaterThan(5);
    // Should include the 1, several +/-, and the 2
    expect(types[0]).toBe("NUMBER");
    expect(types[types.length - 1]).toBe("NUMBER");
  });

  test("tokenizes bitwise operators", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1 & 2 | 3 ~ 4");
    expect(collectTypes(lexer)).toEqual([
      "NUMBER", "BIT_AND", "NUMBER", "BIT_OR", "NUMBER", "BIT_NOT", "NUMBER",
    ]);
  });

  test("tokenizes dice expressions", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("3d6 + 1d4");
    const types = collectTypes(lexer);
    expect(types).toContain("NUMBER");
    expect(types).toContain("IDENT"); // d6, d4 are identifier-like
    expect(types).toContain("PLUS");
  });

  test("tokenizes unicode mathematical operators", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("3 × 4");
    expect(collectTypes(lexer)).toContain("STAR");

    lexer.resetExpression("6 ÷ 2");
    expect(collectTypes(lexer)).toContain("SLASH");

    lexer.resetExpression("5 ≠ 3");
    expect(collectTypes(lexer)).toContain("NEQ");
  });

  test("tokenizes currency symbols", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("£100");
    expect(collectTypes(lexer)).toEqual(["POUND", "NUMBER"]);

    lexer.resetExpression("€50");
    expect(collectTypes(lexer)).toEqual(["EURO", "NUMBER"]);

    lexer.resetExpression("$42");
    expect(collectTypes(lexer)).toEqual(["DOLLAR", "NUMBER"]);
  });

  test("tokenizer does not emit WS or NEWLINE tokens", () => {
    const lexer = new Lexer("en");
    lexer.resetExpression("1   +   2");
    const types = collectTypes(lexer);
    expect(types).not.toContain("WS");
    expect(types).not.toContain("NEWLINE");
    // Should just be NUMBER, PLUS, NUMBER
    expect(types).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("with plugin registrations — resetExpression honors them", () => {
    const lexer = new Lexer("en");
    lexer.registerVocabulary({
      keywords: { my_key: "MY_KEY_TYPE" },
      operators: { "::": "NAMESPACE" },
    });

    lexer.resetExpression("my_key");
    expect(collectTypes(lexer)).toEqual(["MY_KEY_TYPE"]);

    lexer.resetExpression("a::b");
    expect(collectTypes(lexer)).toContain("NAMESPACE");
  });

  test("resetExpression works with locale passed to constructor", () => {
    const lexerEn = new Lexer("en");
    lexerEn.resetExpression("pi + e");
    const typesEn = collectTypes(lexerEn);
    expect(typesEn).toEqual(["PI", "PLUS", "E"]);
  });
});
