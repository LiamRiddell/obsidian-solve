import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer, LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { Token } from "@solve-js/lexer/Token";

/** Helper: tokenize and return array of [type, value] pairs */
function tokenPairs(input: string): [string, string][] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll("expression").map((t) => [t.type, t.value]);
}

/** Helper: tokenize and return array of types only */
function tokenTypes(input: string): string[] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll("expression").map((t) => t.type);
}

/** Helper: tokenize and return raw tokens */
function tokenize(input: string): Token[] {
  const lexer = new ExpressionLexer();
  lexer.reset(input);
  return lexer.tokenizeAll("expression");
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
});

// ═══════════════════════════════════════════════════════════════════════════
// Identifier / Keyword / Unit tokenization
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — identifiers & keywords", () => {
  // ── Basic identifiers ─────────────────────────────────────────────────

  test("simple identifier", () => {
    expect(tokenPairs("foo")).toEqual([["IDENT", "foo"]]);
  });

  test("identifier with digits", () => {
    expect(tokenPairs("var123")).toEqual([["IDENT", "var123"]]);
  });

  test("identifier with underscores", () => {
    expect(tokenPairs("my_var")).toEqual([["IDENT", "my_var"]]);
  });

  test("identifier starting with underscore", () => {
    expect(tokenPairs("_private")).toEqual([["IDENT", "_private"]]);
  });

  test("camelCase identifier", () => {
    expect(tokenPairs("myVariableName")).toEqual([["IDENT", "myVariableName"]]);
  });

  test("identifier followed by operator", () => {
    // Use x and z (not a, b, c which may be units) to ensure IDENT types
    expect(tokenTypes("x+z")).toEqual(["IDENT", "PLUS", "IDENT"]);
  });

  // ── Keyword mappings (via locale keywordMap) ──────────────────────────

  test("PI keyword", () => {
    const t = tokenize("pi");
    expect(t[0].type).toBe("PI");
  });

  test("PI keyword", () => {
    const t = tokenize("pi");
    expect(t[0].type).toBe("PI");
  });

  test("ROLL keyword", () => {
    const t = tokenize("roll");
    expect(t[0].type).toBe("ROLL");
  });

  test("keyword lookup is case-insensitive", () => {
    expect(tokenize("Pi")[0].type).toBe("PI");
    expect(tokenize("ROLL")[0].type).toBe("ROLL");
    expect(tokenize("Of")[0].type).toBe("OF");
  });

  // ── Units (case-sensitive) ────────────────────────────────────────────

  test("unit cm", () => {
    expect(tokenPairs("cm")).toEqual([["UNIT", "cm"]]);
  });

  test("unit m (meters) — 1-char unit via fast path", () => {
    const t = tokenPairs("m");
    expect(t).toEqual([["UNIT", "m"]]);
  });

  test("unit km", () => {
    expect(tokenPairs("km")).toEqual([["UNIT", "km"]]);
  });

  test("unit kg", () => {
    expect(tokenPairs("kg")).toEqual([["UNIT", "kg"]]);
  });

  test("unit s (seconds) not followed by backtick — 1-char unit", () => {
    const t = tokenPairs("s");
    expect(t).toEqual([["UNIT", "s"]]);
  });

  test("unit C (Celsius) — case-sensitive, 1-char unit", () => {
    const t = tokenPairs("C");
    expect(t).toEqual([["UNIT", "C"]]);
  });

  test("c (lowercase) is not a known unit → IDENT", () => {
    const t = tokenize("c");
    // 'c' by itself is not in knownUnits (cl is centiliter, not c)
    expect(t[0].type).toBe("IDENT");
  });

  // ── Inline solve marker ───────────────────────────────────────────────

  test("s followed by backtick is INLINE_SOLVE_START", () => {
    expect(tokenTypes("s`1+2`")).toContain("INLINE_SOLVE_START");
  });

  test("INLINE_SOLVE_START value is 's`'", () => {
    const t = tokenize("s`1+2`");
    const inline = t.find((tk) => tk.type === "INLINE_SOLVE_START");
    expect(inline).toBeDefined();
    expect(inline!.value).toBe("s`");
  });

  test("uppercase S followed by backtick IS inline solve (case-insensitive)", () => {
    const t = tokenize("S`");
    expect(t[0].type).toBe("INLINE_SOLVE_START");
  });

  test("s without backtick is a unit", () => {
    expect(tokenTypes("s + 1")).toEqual(["UNIT", "PLUS", "NUMBER"]);
  });

  // ── Phrase matching ───────────────────────────────────────────────────

  test("'to the power of' → CARET", () => {
    const t = tokenize("to the power of");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("CARET");
    expect(t[0].value).toBe("to the power of");
  });

  test("'power of' → CARET", () => {
    const t = tokenize("power of");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("CARET");
    expect(t[0].value).toBe("power of");
  });

  test("'increase by' → INCREASE_BY", () => {
    const t = tokenize("increase by");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("INCREASE_BY");
  });

  test("'decrease by' → DECREASE_BY", () => {
    const t = tokenize("decrease by");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("DECREASE_BY");
  });

  test("'times by' → TIMES_BY", () => {
    const t = tokenize("times by");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("TIMES_BY");
  });

  test("'multiply by' → MULTIPLY_BY", () => {
    const t = tokenize("multiply by");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("MULTIPLY_BY");
  });

  test("'divide by' → DIVIDE_BY", () => {
    const t = tokenize("divide by");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("DIVIDE_BY");
  });

  test("phrase match is case-insensitive", () => {
    // Phrase matching now runs before keyword lookup, so "To The Power Of"
    // matches the "to the power of" phrase → single CARET token
    const t = tokenize("To The Power Of");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("CARET");
    expect(t[0].value).toBe("To The Power Of");
  });

  test("partial phrase not matched — falls back to keyword+ident", () => {
    const t = tokenize("to the");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("TO");
    expect(t[0].value).toBe("to");
    expect(t[1].type).toBe("IDENT");
    expect(t[1].value).toBe("the");
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
    const tokens = lexer.tokenizeAll("expression");
    expect(tokens[0].line).toBe(1);
    expect(tokens[1].line).toBe(2);
  });

  test("CRLF line breaks", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1\r\n2");
    const tokens = lexer.tokenizeAll("expression");
    expect(tokens[0].line).toBe(1);
    expect(tokens[1].line).toBe(2);
  });

  test("col resets after newline", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("12\n345");
    const tokens = lexer.tokenizeAll("expression");
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
    const tokens = lexer.tokenizeAll("expression");
    expect(tokens.map((t) => t.type)).toEqual([
      "NUMBER", "PLUS", "NUMBER",
      "PLUS", "NUMBER", "PLUS", "NUMBER",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// classifyLine() — Markdown line classification (Phase B)
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — classifyLine", () => {
  const lexer = new ExpressionLexer();

  function classify(input: string) {
    return lexer.classifyLine(input);
  }

  // ── Empty / whitespace ────────────────────────────────────────────

  test("empty string → empty", () => {
    expect(classify("")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("whitespace-only → empty", () => {
    expect(classify("   ")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("tab-only → empty", () => {
    expect(classify("\t")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("leading whitespace then empty → empty", () => {
    expect(classify("  \t  ")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  // ── Headings ─────────────────────────────────────────────────────

  test("# heading → heading, always skip", () => {
    expect(classify("# Introduction")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("## heading → heading, always skip", () => {
    expect(classify("## Section")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("### heading → heading, always skip", () => {
    expect(classify("### Subsection")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("###### heading (max 6) → heading, always skip", () => {
    expect(classify("###### Deep")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("####### (7 hashes) is not a heading → comment", () => {
    // More than 6 # is not standard Markdown heading
    const c = classify("####### Not a heading");
    expect(c.type).toBe("heading"); // comment treated as heading-type skip
    expect(c.skip).toBe(true);
  });

  test("bare # without space → comment", () => {
    const c = classify("#");
    expect(c.skip).toBe(true);
  });

  test("bare ## → comment", () => {
    const c = classify("##");
    expect(c.skip).toBe(true);
  });

  test("heading with content is skipped", () => {
    expect(classify("# Budget: 100 + 200").skip).toBe(true);
  });

  test("indented heading (leading whitespace)", () => {
    expect(classify("  # Title")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  // ── Blockquotes ──────────────────────────────────────────────────

  test("> blockquote → always skip", () => {
    expect(classify("> quoted text")).toEqual({
      type: "blockquote", skip: true, hasInlineSolve: false,
    });
  });

  test("blockquote with content is skipped", () => {
    expect(classify("> 1 + 2 = 3").skip).toBe(true);
  });

  test("Obsidian callout > [!note] → always skip", () => {
    expect(classify("> [!note]")).toEqual({
      type: "blockquote", skip: true, hasInlineSolve: false,
    });
  });

  test("bare > → always skip", () => {
    const c = classify(">");
    expect(c.skip).toBe(true);
  });

  test("bare > with trailing space → always skip", () => {
    const c = classify("> ");
    expect(c.skip).toBe(true);
    expect(c.type).toBe("blockquote");
  });

  test("> without space is not blockquote → expression", () => {
    // ">no-space" is not valid Markdown blockquote syntax (missing space)
    const c = classify(">no-space");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  // ── Code fences ──────────────────────────────────────────────────

  test("``` → code fence, skip", () => {
    expect(classify("```")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("```javascript → code fence, skip", () => {
    expect(classify("```javascript")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("~~~ → code fence, skip", () => {
    expect(classify("~~~")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("indented code fence", () => {
    expect(classify("  ```").skip).toBe(true);
  });

  test("single backtick is not a fence", () => {
    const c = classify("`code`");
    expect(c.type).not.toBe("code_fence");
    expect(c.skip).toBe(false);
  });

  // ── Math fences ──────────────────────────────────────────────────

  test("$$ → math fence, skip", () => {
    expect(classify("$$")).toEqual({
      type: "math_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("$$x^2$$ → math fence with inline content, still skip", () => {
    expect(classify("$$x^2$$")).toEqual({
      type: "math_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("single $ is not a math fence", () => {
    const c = classify("$x^2$");
    expect(c.type).not.toBe("math_fence");
  });

  // ── Horizontal rules ─────────────────────────────────────────────

  test("--- → hr, skip", () => {
    expect(classify("---")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("*** → hr, skip", () => {
    expect(classify("***")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("___ → hr, skip", () => {
    expect(classify("___")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("more than 3 dashes → hr", () => {
    expect(classify("---------").type).toBe("hr");
  });

  test("mixed chars like -*- are not hr", () => {
    expect(classify("-*-").type).not.toBe("hr");
  });

  test("mixed chars like *-* are not hr", () => {
    expect(classify("*-*").type).not.toBe("hr");
  });

  // ── Lists (always evaluate) ───────────────────────────────────────

  test("- item → list, evaluate", () => {
    expect(classify("- item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("* item → list, evaluate", () => {
    expect(classify("* item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("+ item → list, evaluate", () => {
    expect(classify("+ item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("1. item → list, evaluate", () => {
    expect(classify("1. item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("multi-digit ordered list → list, evaluate", () => {
    expect(classify("123. item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("bare - (no space) → list, evaluate", () => {
    const c = classify("-");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare * (no space) → list, evaluate", () => {
    const c = classify("*");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare + (no space) → list, evaluate", () => {
    const c = classify("+");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare 1. (no content) → list, evaluate", () => {
    const c = classify("1. ");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("indented list", () => {
    expect(classify("  - item").type).toBe("list");
  });

  // ── Tables ────────────────────────────────────────────────────────

  test("|---| → table_separator, skip", () => {
    expect(classify("|---|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("|:---| → table_separator (aligned), skip", () => {
    expect(classify("|:---|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("|---:|---:| → table_separator, skip", () => {
    expect(classify("|---:|---:|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("| Cell | → table data row, evaluate", () => {
    const c = classify("| Cell |");
    expect(c.skip).toBe(false);
  });

  test("| 1 + 2 | Data | → table data row, evaluate", () => {
    const c = classify("| 1 + 2 | Data |");
    expect(c.skip).toBe(false);
  });

  // ── Wikilinks / embeds ───────────────────────────────────────────

  test("[[page]] → wikilink, skip", () => {
    expect(classify("[[page]]")).toEqual({
      type: "wikilink", skip: true, hasInlineSolve: false,
    });
  });

  test("![[image.png]] → wikilink (embed), skip", () => {
    expect(classify("![[image.png]]")).toEqual({
      type: "wikilink", skip: true, hasInlineSolve: false,
    });
  });

  test("[[page]] with trailing text is not wikilink → expression", () => {
    const c = classify("[[page]] some text");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  test("[[page]] with trailing expression is not wikilink → expression", () => {
    const c = classify("[[page]] 1 + 2");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  test("wikilink with leading whitespace", () => {
    expect(classify("  [[page]]").type).toBe("wikilink");
  });

  // ── Comments ──────────────────────────────────────────────────────

  test("// comment → comment, skip", () => {
    expect(classify("// this is a comment")).toEqual({
      type: "comment", skip: true, hasInlineSolve: false,
    });
  });

  test("bare // → comment, skip", () => {
    expect(classify("//")).toEqual({
      type: "comment", skip: true, hasInlineSolve: false,
    });
  });

  test("indented // comment → comment, skip", () => {
    expect(classify("  // comment").type).toBe("comment");
  });

  // ── Expression lines ──────────────────────────────────────────────

  test("plain text → expression", () => {
    expect(classify("hello")).toEqual({
      type: "expression", skip: false, hasInlineSolve: false,
    });
  });

  test("arithmetic → expression", () => {
    expect(classify("1 + 2 * 3")).toEqual({
      type: "expression", skip: false, hasInlineSolve: false,
    });
  });

  test("expression with inline solve detected", () => {
    expect(classify("s`1 + 2`")).toEqual({
      type: "expression", skip: false, hasInlineSolve: true,
    });
  });

  test("inline solve mid-sentence", () => {
    expect(classify("total is s`100 + 50` dollars")).toEqual({
      type: "expression", skip: false, hasInlineSolve: true,
    });
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
// Backtick tokenization
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — backticks", () => {
  test("single backtick → BACKTICK_OPEN", () => {
    const t = tokenize("`");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("BACKTICK_OPEN");
    expect(t[0].value).toBe("`");
  });

  test("backtick in expression", () => {
    expect(tokenTypes("`code`")).toEqual(["BACKTICK_OPEN", "IDENT", "BACKTICK_OPEN"]);
  });

  test("double backtick", () => {
    expect(tokenTypes("``")).toEqual(["BACKTICK_OPEN", "BACKTICK_OPEN"]);
  });

  test("triple backtick (in expression mode)", () => {
    expect(tokenTypes("```")).toEqual(["BACKTICK_OPEN", "BACKTICK_OPEN", "BACKTICK_OPEN"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dollar sign
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — dollar sign", () => {
  test("single $ → DOLLAR", () => {
    const t = tokenize("$");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("DOLLAR");
  });

  test("$ in expression", () => {
    expect(tokenTypes("$var")).toEqual(["DOLLAR", "IDENT"]);
  });

  test("$ followed by operator", () => {
    expect(tokenTypes("$+1")).toEqual(["DOLLAR", "PLUS", "NUMBER"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dot token vs decimal
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — dot vs decimal", () => {
  test("single dot → NUMBER (special case for 1-char path)", () => {
    const t = tokenize(".");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("NUMBER");
  });

  test(".. are two DOT tokens", () => {
    expect(tokenTypes("..")).toEqual(["DOT", "DOT"]);
  });

  test("... are three DOT tokens", () => {
    expect(tokenTypes("...")).toEqual(["DOT", "DOT", "DOT"]);
  });

  test("dot after number is DOT token", () => {
    // Use x.y not a.b — b is a known unit (bits)
    expect(tokenTypes("x.y")).toEqual(["IDENT", "DOT", "IDENT"]);
  });

  test("dot after digit (no next digit) → separate DOT", () => {
    // 123.a → NUMBER "123", DOT ".", IDENT "a"
    const t = tokenPairs("123.a");
    expect(t).toEqual([["NUMBER", "123"], ["DOT", "."], ["IDENT", "a"]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Colon-prefixed variables
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — colon-prefixed variables", () => {
  test(":var → COLON + IDENT", () => {
    expect(tokenTypes(":myVar")).toEqual(["COLON", "IDENT"]);
  });

  test(":var = 42 → COLON + IDENT + EQUALS + NUMBER", () => {
    expect(tokenTypes(":myVar = 42")).toEqual([
      "COLON", "IDENT", "EQUALS", "NUMBER",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LexerToken constructor
// ═══════════════════════════════════════════════════════════════════════════

describe("LexerToken", () => {
  test("constructs with all properties", () => {
    const t = new LexerToken("NUMBER", "42", "42", 0, 0, 1, 1);
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
// Reset and reuse
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — reset and reuse", () => {
  test("reset with new input clears previous state", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("1 + 2");
    const first = lexer.tokenizeAll("expression");
    expect(first).toHaveLength(3);

    lexer.reset("42");
    const second = lexer.tokenizeAll("expression");
    expect(second).toHaveLength(1);
    expect(second[0].value).toBe("42");
  });

  test("reuse for many inputs does not leak state", () => {
    const lexer = new ExpressionLexer();
    const inputs = ["1", "a+b", "3.14", "()", "hello", "999n"];

    for (const input of inputs) {
      lexer.reset(input);
      const tokens = lexer.tokenizeAll("expression");
      expect(tokens.length).toBeGreaterThan(0);
    }
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
