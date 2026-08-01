import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer, LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { Token } from "@solve-js/lexer/Token";

/** Helper: tokenize and return array of [type, value] pairs */
function tokenPairs(input: string): [string, string][] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll().map((t) => [t.type, t.value]);
}

/** Helper: tokenize and return array of types only */
function tokenTypes(input: string): string[] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll().map((t) => t.type);
}

/** Helper: tokenize and return raw tokens */
function tokenize(input: string): Token[] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll();
}

// ═══════════════════════════════════════════════════════════════════════════
// String literals
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — string literals", () => {
  test("empty string", () => {
    const t = tokenize('""');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
    expect(t[0].value).toBe('""');
  });

  test("simple string", () => {
    const t = tokenize('"hello"');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
    expect(t[0].value).toBe('"hello"');
  });

  test("string with spaces", () => {
    const t = tokenize('"hello world"');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
    expect(t[0].value).toBe('"hello world"');
  });

  test("string with special characters", () => {
    const t = tokenize('"!@#$%^&*()"');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
  });

  test("string with escaped quote", () => {
    const t = tokenize('"hello \\"world\\""');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
  });

  test("string with backslash escape", () => {
    const t = tokenize('"path\\\\to\\\\file"');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
  });

  test("unterminated string still returns STRING", () => {
    const t = tokenize('"unterminated');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
    expect(t[0].value).toBe('"unterminated');
  });

  test("string with numbers inside", () => {
    const t = tokenize('"12345"');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("STRING");
    expect(t[0].value).toBe('"12345"');
  });

  test("string in expression context", () => {
    expect(tokenTypes('1 + "hello" + 2')).toEqual([
      "NUMBER", "PLUS", "STRING", "PLUS", "NUMBER",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Comments
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — comments", () => {
  test("# comment", () => {
    const t = tokenize("# this is a comment");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("COMMENT");
  });

  test("// comment", () => {
    const t = tokenize("// another comment");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("COMMENT");
  });

  test("# comment after expression", () => {
    expect(tokenTypes("1 + 2 # inline")).toEqual([
      "NUMBER", "PLUS", "NUMBER", "COMMENT",
    ]);
  });

  test("// comment after expression", () => {
    expect(tokenTypes("3 * 4 // inline")).toEqual([
      "NUMBER", "STAR", "NUMBER", "COMMENT",
    ]);
  });

  test("bare # comment", () => {
    const t = tokenize("#");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("COMMENT");
  });

  test("bare // comment", () => {
    const t = tokenize("//");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("COMMENT");
  });

  test("comment with operators inside is not tokenized", () => {
    const t = tokenize("# 1 + 2 = 3");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("COMMENT");
    expect(t[0].value).toBe("# 1 + 2 = 3");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Non-ASCII / Unicode
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — non-ASCII / unicode", () => {
  test("× becomes STAR", () => {
    const t = tokenize("3 × 4");
    expect(t.map((tk) => tk.type)).toEqual(["NUMBER", "STAR", "NUMBER"]);
  });

  test("÷ becomes SLASH", () => {
    const t = tokenize("6 ÷ 2");
    expect(t.map((tk) => tk.type)).toEqual(["NUMBER", "SLASH", "NUMBER"]);
  });

  test("≠ becomes NEQ", () => {
    const t = tokenize("5 ≠ 3");
    expect(t.map((tk) => tk.type)).toEqual(["NUMBER", "NEQ", "NUMBER"]);
  });

  test("£ becomes POUND", () => {
    const t = tokenize("£");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("POUND");
    expect(t[0].value).toBe("£");
  });

  test("€ becomes EURO", () => {
    const t = tokenize("€");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("EURO");
    expect(t[0].value).toBe("€");
  });

  test("unknown unicode (≥128) becomes IDENT", () => {
    // Greek alpha α (U+03B1) — not ASCII, falls to IDENT
    const t = tokenize("α");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("IDENT");
    expect(t[0].value).toBe("α");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Token properties (LexerToken class)
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — token properties", () => {
  test("offset points to start position", () => {
    const t = tokenize("1 + 2");
    expect(t[0].offset).toBe(0); // "1"
    expect(t[1].offset).toBe(2); // "+"
    expect(t[2].offset).toBe(4); // "2"
  });

  test("col is 1-indexed from line start", () => {
    const t = tokenize("1 + 2");
    expect(t[0].col).toBe(1);
    expect(t[1].col).toBe(3);
    expect(t[2].col).toBe(5);
  });

  test("line starts at 1", () => {
    const t = tokenize("42");
    expect(t[0].line).toBe(1);
  });

  test("lineBreaks defaults to 0 for regular tokens", () => {
    const t = tokenize("42");
    expect(t[0].lineBreaks).toBe(0);
  });

  test("text matches value for simple tokens", () => {
    const t = tokenize("42");
    expect(t[0].text).toBe(t[0].value);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Iterator protocol
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — iterator protocol", () => {
  test("for...of iterates all tokens", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1 + 2");
    const types: string[] = [];
    for (const t of lexer) {
      types.push(t.type);
    }
    expect(types).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("spread works", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1 + 2");
    const tokens = [...lexer];
    expect(tokens).toHaveLength(3);
  });

  test("empty input yields zero iterations", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("");
    const tokens = [...lexer];
    expect(tokens).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LexerToken constructor
// ═══════════════════════════════════════════════════════════════════════════

describe("LexerToken", () => {
  test("constructs with all properties", () => {
    const t = new LexerToken("NUMBER", 1, "42", "42", 0, 0, 1, 1);
    expect(t.type).toBe("NUMBER");
    expect(t.value).toBe("42");
    expect(t.text).toBe("42");
    expect(t.offset).toBe(0);
    expect(t.lineBreaks).toBe(0);
    expect(t.line).toBe(1);
    expect(t.col).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases & fuzz safety
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — edge cases", () => {
  test("deeply nested structures", () => {
    const nested = "((((((((((1))))))))))";
    expect(() => tokenize(nested)).not.toThrow();
  });

  test("consecutive backticks", () => {
    expect(() => tokenize("````")).not.toThrow();
  });

  test("mixed unicode and ascii", () => {
    expect(() => tokenize("x × y ÷ z")).not.toThrow();
  });

  test("trailing dot on number then identifier", () => {
    // "5.a" — the dot after 5 with non-digit next char should become DOT token
    const t = tokenPairs("5.a");
    expect(t).toEqual([["NUMBER", "5"], ["DOT", "."], ["IDENT", "a"]]);
  });
});
