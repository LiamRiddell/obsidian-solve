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

  test("PI keyword (uppercase)", () => {
    const t = tokenize("PI");
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

  // ── Phrase matching (now handled by TokenNormalizer, not lexer) ──────
  // These tests verify the lexer produces raw keyword+IDENT tokens.
  // Phrase fusion (e.g., "to the power of" → CARET) happens in TokenNormalizer.

  test("'to the power of' produces raw keyword+IDENT tokens", () => {
    const t = tokenize("to the power of");
    // Lexer emits: TO, IDENT, IDENT, OF (keywords resolved, no fusion)
    expect(t.length).toBeGreaterThanOrEqual(4);
    expect(t[0].type).toBe("TO");
  });

  test("'power of' produces raw keyword+IDENT tokens", () => {
    const t = tokenize("power of");
    // Lexer emits: IDENT, OF (no phrase fusion)
    expect(t.length).toBeGreaterThanOrEqual(2);
  });

  test("'increase by' → INCREASE + BY (raw lexer)", () => {
    const t = tokenize("increase by");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("INCREASE");
    expect(t[1].type).toBe("BY");
  });

  test("'decrease by' → DECREASE + BY (raw lexer)", () => {
    const t = tokenize("decrease by");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("DECREASE");
    expect(t[1].type).toBe("BY");
  });

  test("'times by' → STAR + BY (raw lexer)", () => {
    const t = tokenize("times by");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("STAR");
    expect(t[1].type).toBe("BY");
  });

  test("'multiply by' → STAR + BY (raw lexer)", () => {
    const t = tokenize("multiply by");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("STAR");
    expect(t[1].type).toBe("BY");
  });

  test("'divide by' → SLASH + BY (raw lexer)", () => {
    const t = tokenize("divide by");
    expect(t).toHaveLength(2);
    expect(t[0].type).toBe("SLASH");
    expect(t[1].type).toBe("BY");
  });

  test("phrase match case-insensitive — raw TO + IDENT tokens", () => {
    // Lexer resolves "To" → TO, "The" → IDENT, "Power" → IDENT, "Of" → OF
    const t = tokenize("To The Power Of");
    expect(t.length).toBeGreaterThanOrEqual(4);
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
