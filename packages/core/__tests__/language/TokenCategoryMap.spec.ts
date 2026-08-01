import { afterEach, describe, expect, test } from "@jest/globals";
import { TokenTypes } from "@solve-js/lexer/Token";
import {
  getTokenCategory,
  registerTokenCategory,
  unregisterTokenCategory,
  UNCATEGORIZED_TOKEN_TYPES,
} from "@solve-js/language/TokenCategoryMap";

describe("TokenCategoryMap", () => {
  test("returns 'number' for NUMBER", () => {
    expect(getTokenCategory("NUMBER")).toBe("number");
  });

  test("returns 'keyword' for keywords", () => {
    const keywords = ["PI", "E", "NOW", "TODAY", "TOMORROW", "YESTERDAY", "ROLL", "OF",
      "DURATION_DAY", "DURATION_WEEK", "DURATION_MONTH", "DURATION_YEAR",
      "DURATION_HOUR", "DURATION_MINUTE", "DURATION_SECOND",
      "NEXT", "LAST", "UNTIL", "SINCE", "BETWEEN", "FROM", "BEST", "KEYWORD"];
    for (const kw of keywords) {
      expect(getTokenCategory(kw)).toBe("keyword");
    }
  });

  test("returns 'operator' for arithmetic/assignment operators", () => {
    const operators = ["PLUS", "MINUS", "STAR", "SLASH", "CARET", "PERCENT",
      "LSHIFT", "RSHIFT", "EQUALS", "INCREASE_BY", "DECREASE_BY",
      "TIMES_BY", "MULTIPLY_BY", "DIVIDE_BY", "MOD", "INCREASE", "DECREASE",
      "UNICODE_MATH", "QUESTION", "BANG"];
    for (const op of operators) {
      expect(getTokenCategory(op)).toBe("operator");
    }
  });

  test("returns 'comparison' for comparison operators", () => {
    for (const op of ["NEQ", "IN", "GTE", "LTE", "EQUALITY"]) {
      expect(getTokenCategory(op)).toBe("comparison");
    }
  });

  test("returns 'bitwise' for bitwise operators", () => {
    for (const op of ["BIT_AND", "BIT_OR", "BIT_NOT", "BIT_XOR"]) {
      expect(getTokenCategory(op)).toBe("bitwise");
    }
  });

  test("returns 'function' for FUNC", () => {
    expect(getTokenCategory("FUNC")).toBe("function");
  });

  test("returns 'variable' for DOLLAR, COLON, and IDENT", () => {
    // IDENT is a deliberate behavior change from the old className-based map
    // (which left it uncategorized): bare identifiers are recognized-by-the-
    // grammar variable references at lex time, independent of whether
    // they'll later fail at eval time as undefined.
    expect(getTokenCategory("DOLLAR")).toBe("variable");
    expect(getTokenCategory("COLON")).toBe("variable");
    expect(getTokenCategory("IDENT")).toBe("variable");
  });

  test("returns 'string' for STRING", () => {
    expect(getTokenCategory("STRING")).toBe("string");
  });

  test("returns 'unit' for unit/conversion tokens", () => {
    for (const t of ["UNIT", "CONVERT", "TO", "POUND", "EURO"]) {
      expect(getTokenCategory(t)).toBe("unit");
    }
  });

  test("returns 'datetime' for datetime literal/duration tokens", () => {
    expect(getTokenCategory("DATETIME_LITERAL")).toBe("datetime");
    expect(getTokenCategory("DURATION")).toBe("datetime");
  });

  test("returns 'vector' for VEC2/VEC3/VEC4", () => {
    for (const t of ["VEC2", "VEC3", "VEC4"]) {
      expect(getTokenCategory(t)).toBe("vector");
    }
  });

  test("returns 'punctuation' for grouping/separator tokens", () => {
    // Deliberate behavior change: these used to return undefined (unstyled).
    for (const t of ["LPAREN", "RPAREN", "LBRACKET", "RBRACKET", "LBRACE", "RBRACE", "DOT", "COMMA", "SEMICOLON"]) {
      expect(getTokenCategory(t)).toBe("punctuation");
    }
  });

  test("returns 'error' for ERROR", () => {
    expect(getTokenCategory("ERROR")).toBe("error");
  });

  test("returns undefined for WS, NEWLINE, and unknown token types", () => {
    expect(getTokenCategory("WS")).toBeUndefined();
    expect(getTokenCategory("NEWLINE")).toBeUndefined();
    expect(getTokenCategory("UNKNOWN")).toBeUndefined();
  });

  test("completeness: every TokenTypes entry is categorized or explicitly allowlisted", () => {
    const missing: string[] = [];
    for (const tokenType of Object.values(TokenTypes)) {
      const category = getTokenCategory(tokenType);
      if (category === undefined && !UNCATEGORIZED_TOKEN_TYPES.has(tokenType)) {
        missing.push(tokenType);
      }
    }
    expect(missing).toEqual([]);
  });

  describe("plugin registration", () => {
    afterEach(() => {
      unregisterTokenCategory("TEST_PLUGIN_TOKEN");
    });

    test("registerTokenCategory makes a new token type resolvable", () => {
      expect(getTokenCategory("TEST_PLUGIN_TOKEN")).toBeUndefined();
      registerTokenCategory("TEST_PLUGIN_TOKEN", "keyword");
      expect(getTokenCategory("TEST_PLUGIN_TOKEN")).toBe("keyword");
    });

    test("unregisterTokenCategory removes it again", () => {
      registerTokenCategory("TEST_PLUGIN_TOKEN", "keyword");
      unregisterTokenCategory("TEST_PLUGIN_TOKEN");
      expect(getTokenCategory("TEST_PLUGIN_TOKEN")).toBeUndefined();
    });

    test("plugin categories override built-in ones for the same token type", () => {
      registerTokenCategory("NUMBER", "keyword");
      expect(getTokenCategory("NUMBER")).toBe("keyword");
      unregisterTokenCategory("NUMBER");
      expect(getTokenCategory("NUMBER")).toBe("number");
    });

    test("open-ended plugin category strings are accepted (not limited to the built-in union)", () => {
      registerTokenCategory("TEST_PLUGIN_TOKEN", "osrs-item");
      expect(getTokenCategory("TEST_PLUGIN_TOKEN")).toBe("osrs-item");
    });
  });
});
