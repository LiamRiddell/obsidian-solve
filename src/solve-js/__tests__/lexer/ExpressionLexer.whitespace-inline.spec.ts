import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";
import { Token } from "@solve-js/lexer/Token";

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
// Whitespace handling
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — whitespace handling", () => {
  test("spaces are not emitted as tokens", () => {
    const types = tokenTypes("1 2 3");
    expect(types).toEqual(["NUMBER", "NUMBER", "NUMBER"]);
  });

  test("tabs are not emitted as tokens", () => {
    const types = tokenTypes("1\t2\t3");
    expect(types).toEqual(["NUMBER", "NUMBER", "NUMBER"]);
  });

  test("mixed whitespace is skipped", () => {
    const types = tokenTypes("1  \t  2");
    expect(types).toEqual(["NUMBER", "NUMBER"]);
  });

  test("leading whitespace is skipped", () => {
    expect(tokenTypes("   42")).toEqual(["NUMBER"]);
  });

  test("trailing whitespace is skipped", () => {
    expect(tokenTypes("42   ")).toEqual(["NUMBER"]);
  });

  test("whitespace-only returns empty array", () => {
    expect(tokenize("   ")).toEqual([]);
  });

  test("tab-only returns empty array", () => {
    expect(tokenize("\t")).toEqual([]);
  });

  test("whitespace with newline: line counter increments", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1\n2");
    const tokens = lexer.tokenizeAll();
    expect(tokens[0].line).toBe(1);
    expect(tokens[1].line).toBe(2);
  });

  test("CRLF line breaks", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1\r\n2");
    const tokens = lexer.tokenizeAll();
    expect(tokens[0].line).toBe(1);
    expect(tokens[1].line).toBe(2);
  });

  test("col resets after newline", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("12\n345");
    const tokens = lexer.tokenizeAll();
    expect(tokens[0].col).toBe(1);  // "12" starts at col 1
    expect(tokens[0].value).toBe("12");
    expect(tokens[1].col).toBe(1);  // "345" starts at col 1
    expect(tokens[1].value).toBe("345");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Complex expressions
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — complex expressions", () => {
  test("arithmetic chain", () => {
    expect(tokenTypes("1 + 2 * 3 - 4 / 5 ^ 6 % 7")).toEqual([
      "NUMBER", "PLUS", "NUMBER", "STAR", "NUMBER",
      "MINUS", "NUMBER", "SLASH", "NUMBER", "CARET",
      "NUMBER", "PERCENT", "NUMBER",
    ]);
  });

  test("parenthesized expression", () => {
    expect(tokenTypes("(1 + 2) * 3")).toEqual([
      "LPAREN", "NUMBER", "PLUS", "NUMBER", "RPAREN",
      "STAR", "NUMBER",
    ]);
  });

  test("deeply nested parentheses", () => {
    expect(tokenTypes("((((1))))")).toEqual([
      "LPAREN", "LPAREN", "LPAREN", "LPAREN",
      "NUMBER",
      "RPAREN", "RPAREN", "RPAREN", "RPAREN",
    ]);
  });

  test("function call", () => {
    // sin is FUNC keyword
    expect(tokenTypes("sin(0)")).toEqual([
      "FUNC", "LPAREN", "NUMBER", "RPAREN",
    ]);
  });

  test("vector creation → VEC2 keyword", () => {
    expect(tokenTypes("vec2(1, 2)")).toEqual([
      "VEC2", "LPAREN", "NUMBER", "COMMA", "NUMBER", "RPAREN",
    ]);
  });

  test("chained operators without spaces", () => {
    expect(tokenTypes("1+-+-+-2")).toEqual([
      "NUMBER", "PLUS", "MINUS", "PLUS", "MINUS", "PLUS", "MINUS", "NUMBER",
    ]);
  });

  test("multi-line expression", () => {
    const input = "1 + 2\n+ 3 + 4";
    const lexer = new ExpressionLexer();
    lexer.reset(input);
    const tokens = lexer.tokenizeAll();
    expect(tokens.map((t) => t.type)).toEqual([
      "NUMBER", "PLUS", "NUMBER",
      "PLUS", "NUMBER", "PLUS", "NUMBER",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// findInlineSolves()
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — findInlineSolves", () => {
  const lexer = new ExpressionLexer();

  test("no inline solve → empty array", () => {
    expect(lexer.findInlineSolves("1 + 2")).toEqual([]);
  });

  test("simple inline solve s`1+2`", () => {
    const spans = lexer.findInlineSolves("s`1+2`");
    expect(spans).toHaveLength(1);
    expect(spans[0].expression).toBe("1+2");
    expect(spans[0].start).toBe(0);
  });

  test("mid-sentence inline solve", () => {
    const spans = lexer.findInlineSolves("total is s`100 + 50` dollars");
    expect(spans).toHaveLength(1);
    expect(spans[0].expression).toBe("100 + 50");
    expect(spans[0].start).toBe(9);
  });

  test("multiple inline solves", () => {
    const spans = lexer.findInlineSolves("s`1+2` and s`3*4`");
    expect(spans).toHaveLength(2);
    expect(spans[0].expression).toBe("1+2");
    expect(spans[1].expression).toBe("3*4");
  });

  test("unterminated inline solve", () => {
    const spans = lexer.findInlineSolves("s`1+2");
    expect(spans).toHaveLength(1);
    expect(spans[0].expression).toBe("1+2");
  });

  test("inline solve with escaped backtick", () => {
    const spans = lexer.findInlineSolves("s`hello \\`world\\``");
    expect(spans).toHaveLength(1);
    expect(spans[0].expression).toBe("hello \\`world\\`");
  });

  test("columnNumber is 1-indexed", () => {
    const spans = lexer.findInlineSolves("s`42`");
    expect(spans[0].columnNumber).toBe(1);
  });

  test("columnNumber in mid-sentence", () => {
    const spans = lexer.findInlineSolves("   s`42`");
    expect(spans[0].columnNumber).toBe(4);
  });

  test("uppercase S is not detected", () => {
    const spans = lexer.findInlineSolves("S`not an inline`");
    expect(spans).toHaveLength(0);
  });

  test("s without backtick is not detected", () => {
    const spans = lexer.findInlineSolves("s is seconds");
    expect(spans).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reset and reuse
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — reset and reuse", () => {
  test("reset with new input clears previous state", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1 + 2");
    const first = lexer.tokenizeAll();
    expect(first).toHaveLength(3);

    lexer.reset("42");
    const second = lexer.tokenizeAll();
    expect(second).toHaveLength(1);
    expect(second[0].value).toBe("42");
  });

  test("reuse for many inputs does not leak state", () => {
    const lexer = new ExpressionLexer();
    const inputs = ["1", "a+b", "3.14", "()", "hello", "999n"];

    for (const input of inputs) {
      lexer.reset(input);
      const tokens = lexer.tokenizeAll();
      expect(tokens.length).toBeGreaterThan(0);
    }
  });
});
