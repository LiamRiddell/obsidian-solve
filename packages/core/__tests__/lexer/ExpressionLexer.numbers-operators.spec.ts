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
// Fast paths (0-char and 1-char)
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — fast paths", () => {
  test("0-char empty string returns empty array", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("1-char digit returns NUMBER", () => {
    const t = tokenize("7");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("NUMBER");
    expect(t[0].value).toBe("7");
  });

  test("1-char decimal dot returns NUMBER", () => {
    const t = tokenize(".");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("NUMBER");
    expect(t[0].value).toBe(".");
  });

  test("1-char alpha returns keyword or IDENT", () => {
    const t = tokenize("x");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("IDENT");
    expect(t[0].value).toBe("x");
  });

  test("1-char dollar sign returns DOLLAR", () => {
    const t = tokenize("$");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("DOLLAR");
    expect(t[0].value).toBe("$");
  });

  test("1-char operator returns named type", () => {
    const t = tokenize("+");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("PLUS");
    expect(t[0].value).toBe("+");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Number tokenization
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — numbers", () => {
  // ── Integers ──────────────────────────────────────────────────────────

  test("simple integer", () => {
    expect(tokenPairs("42")).toEqual([["NUMBER", "42"]]);
  });

  test("zero", () => {
    expect(tokenPairs("0")).toEqual([["NUMBER", "0"]]);
  });

  test("large integer", () => {
    expect(tokenPairs("1234567890")).toEqual([["NUMBER", "1234567890"]]);
  });

  test("integer with trailing operator", () => {
    expect(tokenTypes("123+456")).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("integer followed by identifier", () => {
    expect(tokenPairs("3apples")).toEqual([["NUMBER", "3"], ["IDENT", "apples"]]);
  });

  // ── Decimals ──────────────────────────────────────────────────────────

  test("simple decimal", () => {
    expect(tokenPairs("3.14")).toEqual([["NUMBER", "3.14"]]);
  });

  test("decimal starting with dot", () => {
    expect(tokenPairs(".5")).toEqual([["NUMBER", ".5"]]);
  });

  test("decimal ending with dot emits trailing DOT token", () => {
    expect(tokenPairs("5.")).toEqual([["NUMBER", "5"], ["DOT", "."]]);
  });

  test("multiple decimal dots — second dot starts new decimal", () => {
    // 1.2.3 → NUMBER "1.2", NUMBER ".3" (DOT handler calls tokenizeNumber)
    const t = tokenPairs("1.2.3");
    expect(t).toEqual([["NUMBER", "1.2"], ["NUMBER", ".3"]]);
  });

  test("zero-point-number", () => {
    expect(tokenPairs("0.0")).toEqual([["NUMBER", "0.0"]]);
    expect(tokenPairs("0.001")).toEqual([["NUMBER", "0.001"]]);
  });

  // ── Scientific notation ───────────────────────────────────────────────

  test("scientific notation with lowercase e", () => {
    expect(tokenPairs("1.5e10")).toEqual([["NUMBER", "1.5e10"]]);
  });

  test("scientific notation with uppercase E", () => {
    expect(tokenPairs("2E5")).toEqual([["NUMBER", "2E5"]]);
  });

  test("scientific notation negative exponent", () => {
    expect(tokenPairs("1.5e-10")).toEqual([["NUMBER", "1.5e-10"]]);
  });

  test("scientific notation positive exponent", () => {
    expect(tokenPairs("1.5e+3")).toEqual([["NUMBER", "1.5e+3"]]);
  });

  test("scientific notation with integer base", () => {
    expect(tokenPairs("100e3")).toEqual([["NUMBER", "100e3"]]);
  });

  test("bare e at end of integer is not an exponent — 'e' is keyword E", () => {
    const t = tokenPairs("1e");
    expect(t).toEqual([["NUMBER", "1"], ["E", "e"]]);
  });

  test("bare E at end of integer is not an exponent — 'E' is keyword E", () => {
    const t = tokenPairs("1E");
    expect(t).toEqual([["NUMBER", "1"], ["E", "E"]]);
  });

  test("e+ is consumed as exponent sign — emits single NUMBER", () => {
    const t = tokenPairs("1e+");
    expect(t).toEqual([["NUMBER", "1e+"]]);
  });

  test("e- is consumed as exponent sign — emits single NUMBER", () => {
    const t = tokenPairs("1e-");
    expect(t).toEqual([["NUMBER", "1e-"]]);
  });

  // ── Hex literals ──────────────────────────────────────────────────────

  test("hex lowercase", () => {
    expect(tokenPairs("0xff")).toEqual([["NUMBER", "0xff"]]);
  });

  test("hex uppercase", () => {
    expect(tokenPairs("0xFF")).toEqual([["NUMBER", "0xFF"]]);
  });

  test("hex with mixed case", () => {
    expect(tokenPairs("0xDeadBeef")).toEqual([["NUMBER", "0xDeadBeef"]]);
  });

  test("hex zero", () => {
    expect(tokenPairs("0x0")).toEqual([["NUMBER", "0x0"]]);
  });

  test("hex with all valid digits", () => {
    expect(tokenPairs("0xABCDEF0123456789abcdef")).toEqual([
      ["NUMBER", "0xABCDEF0123456789abcdef"],
    ]);
  });

  test("bare 0x emits single NUMBER token", () => {
    const t = tokenPairs("0x");
    expect(t).toEqual([["NUMBER", "0x"]]);
  });

  test("bare 0X emits single NUMBER token", () => {
    const t = tokenPairs("0X");
    expect(t).toEqual([["NUMBER", "0X"]]);
  });

  // ── Binary literals ───────────────────────────────────────────────────

  test("binary lowercase", () => {
    expect(tokenPairs("0b1010")).toEqual([["NUMBER", "0b1010"]]);
  });

  test("binary uppercase", () => {
    expect(tokenPairs("0B1111")).toEqual([["NUMBER", "0B1111"]]);
  });

  test("binary zero", () => {
    expect(tokenPairs("0b0")).toEqual([["NUMBER", "0b0"]]);
  });

  test("binary with all 1s", () => {
    expect(tokenPairs("0b11111111")).toEqual([["NUMBER", "0b11111111"]]);
  });

  test("bare 0b emits single NUMBER token", () => {
    const t = tokenPairs("0b");
    expect(t).toEqual([["NUMBER", "0b"]]);
  });

  test("bare 0B emits single NUMBER token", () => {
    const t = tokenPairs("0B");
    expect(t).toEqual([["NUMBER", "0B"]]);
  });

  // ── Octal literals ────────────────────────────────────────────────────

  test("octal lowercase", () => {
    expect(tokenPairs("0o17")).toEqual([["NUMBER", "0o17"]]);
  });

  test("octal uppercase", () => {
    expect(tokenPairs("0O17")).toEqual([["NUMBER", "0O17"]]);
  });

  test("octal zero", () => {
    expect(tokenPairs("0o0")).toEqual([["NUMBER", "0o0"]]);
  });

  test("octal stops at first non-octal digit (8 or 9)", () => {
    // "0o178" -- "17" is valid octal, "8" isn't an octal digit, so the
    // number scan stops there, leaving "8" as a separate token (matches
    // hex/binary's same stop-at-first-invalid-digit behavior above).
    expect(tokenPairs("0o178")).toEqual([["NUMBER", "0o17"], ["NUMBER", "8"]]);
  });

  test("bare 0o emits single NUMBER token", () => {
    const t = tokenPairs("0o");
    expect(t).toEqual([["NUMBER", "0o"]]);
  });

  test("bare 0O emits single NUMBER token", () => {
    const t = tokenPairs("0O");
    expect(t).toEqual([["NUMBER", "0O"]]);
  });

  // ── BigInt suffix ─────────────────────────────────────────────────────

  test("BigInt with lowercase n", () => {
    expect(tokenPairs("100n")).toEqual([["BIGINT", "100n"]]);
  });

  test("BigInt after decimal is not BigInt (only int)", () => {
    // 1.5n → NUMBER "1.5", IDENT "n" (BigInt only when !hasDecimal)
    const t = tokenPairs("1.5n");
    expect(t).toEqual([["NUMBER", "1.5"], ["IDENT", "n"]]);
  });

  test("BigInt on large integer", () => {
    expect(tokenPairs("99999999999999999999999999n")).toEqual([
      ["BIGINT", "99999999999999999999999999n"],
    ]);
  });

  test("BigInt zero is valid", () => {
    expect(tokenPairs("0n")).toEqual([["BIGINT", "0n"]]);
  });

  // ── Thousands separators ──────────────────────────────────────────────

  test("thousands separators with comma", () => {
    expect(tokenPairs("1,234")).toEqual([["NUMBER", "1,234"]]);
  });

  test("thousands separators with dot", () => {
    expect(tokenPairs("1.234.567")).toEqual([["NUMBER", "1.234.567"]]);
  });

  test("thousands separator in large number", () => {
    expect(tokenPairs("12,345,678")).toEqual([["NUMBER", "12,345,678"]]);
  });

  test("thousands separators must have 3 digits after", () => {
    // 1,2 → NUMBER "1", COMMA ",", NUMBER "2"
    const t = tokenPairs("1,2");
    expect(t).toEqual([["NUMBER", "1"], ["COMMA", ","], ["NUMBER", "2"]]);
  });

  test("thousands separator needs int part first", () => {
    // .1,234 → NUMBER ".1", COMMA ",", NUMBER "234"
    const t = tokenPairs(".1,234");
    expect(t).toEqual([["NUMBER", ".1"], ["COMMA", ","], ["NUMBER", "234"]]);
  });

  /**
   * Bug (found via a full playground-examples audit): a decimal fraction
   * with 4+ digits after the point — e.g. "0.0001" — had its first 3
   * fractional digits misread by the thousands-separator heuristic above
   * as a "." group (like the "234" in "1.234.567"), silently truncating
   * the number to "0.000" and leaving the remaining digit(s) to lex as a
   * SEPARATE, unrelated NUMBER token right after. "0.0001 BTC to USD"
   * tokenized as five tokens — NUMBER "0.000", NUMBER "1", UNIT "BTC",
   * TO, UNIT "USD" — instead of four, and the parser silently dropped
   * everything after the first stray token, evaluating to a bare 0
   * instead of a real 6 USD quantity.
   *
   * Fix: a genuine thousands group is always exactly 3 digits, followed
   * by a non-digit (another separator, or the end of the number) — never
   * a 4th consecutive digit. That's the one case a real thousands-group
   * can never produce, so it's a safe, unambiguous signal to prefer the
   * decimal-fraction reading instead.
   */
  test("decimal fraction with exactly 4 digits after the point is NOT split by the thousands-separator heuristic", () => {
    expect(tokenPairs("0.0001")).toEqual([["NUMBER", "0.0001"]]);
  });

  test("decimal fraction with many digits after the point tokenizes as one NUMBER", () => {
    expect(tokenPairs("0.00015")).toEqual([["NUMBER", "0.00015"]]);
    expect(tokenPairs("3.14159")).toEqual([["NUMBER", "3.14159"]]);
    expect(tokenPairs("1.23456789")).toEqual([["NUMBER", "1.23456789"]]);
  });

  test("chained dot thousands-groups still coalesce correctly (no regression)", () => {
    expect(tokenPairs("1.234.567")).toEqual([["NUMBER", "1.234.567"]]);
    expect(tokenPairs("12.345.678")).toEqual([["NUMBER", "12.345.678"]]);
  });

  test("a genuine standalone 3-digit dot group still coalesces (existing, unchanged ambiguous case)", () => {
    // "1.234" alone (exactly 3 digits, nothing after) is inherently
    // ambiguous between "1234 grouped" and "1.234 decimal" — this fix
    // deliberately only targets the unambiguous 4+-digit case above and
    // leaves this pre-existing heuristic's choice (thousands-group) as is.
    expect(tokenPairs("1.234")).toEqual([["NUMBER", "1.234"]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Single-character operators
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — single-char operators", () => {
  const singleOps: [string, string][] = [
    ["+", "PLUS"],
    ["-", "MINUS"],
    ["*", "STAR"],
    ["/", "SLASH"],
    ["^", "CARET"],
    ["%", "PERCENT"],
    ["(", "LPAREN"],
    [")", "RPAREN"],
    ["[", "LBRACKET"],
    ["]", "RBRACKET"],
    ["{", "LBRACE"],
    ["}", "RBRACE"],
    [",", "COMMA"],
    [":", "COLON"],
    [";", "SEMICOLON"],
    ["=", "EQUALS"],
    ["?", "QUESTION"],
    ["!", "BANG"],
    ["&", "BIT_AND"],
    ["|", "BIT_OR"],
    ["~", "BIT_NOT"],
  ];

  test.each(singleOps)("'%s' → %s", (input, expectedType) => {
    const t = tokenize(input);
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe(expectedType);
    expect(t[0].value).toBe(input);
  });

  test("single unknown ASCII character is silently skipped", () => {
    // Backslash (charCode 92) is not in any character class — CharClass.SKIP
    // Unknown ASCII (< 128) is silently skipped by the main loop default case
    const t = tokenize("\\");
    expect(t).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Two-character operators
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — two-char operators", () => {
  const twoCharOps: [string, string][] = [
    ["==", "EQUALITY"],
    ["!=", "NEQ"],
    [">=", "GTE"],
    ["<=", "LTE"],
    ["<<", "LSHIFT"],
    [">>", "RSHIFT"],
  ];

  test.each(twoCharOps)("'%s' → %s", (input, expectedType) => {
    const t = tokenize(input);
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe(expectedType);
    expect(t[0].value).toBe(input);
  });

  test("** emits two STAR tokens (moo compatibility)", () => {
    expect(tokenTypes("2**3")).toEqual(["NUMBER", "STAR", "STAR", "NUMBER"]);
  });

  test("two-char operators in expression context", () => {
    expect(tokenTypes("1 <= 2")).toEqual(["NUMBER", "LTE", "NUMBER"]);
    // b and c are known units, so use x and y which are IDENT
    expect(tokenTypes("x != y")).toEqual(["IDENT", "NEQ", "IDENT"]);
  });

  test("<< and >> are not confused with LTE/GTE", () => {
    // Use x and y (not b or a which are units) to avoid UNIT tokens
    expect(tokenTypes("1 << 2 >> 3")).toEqual([
      "NUMBER", "LSHIFT", "NUMBER", "RSHIFT", "NUMBER",
    ]);
  });
});
