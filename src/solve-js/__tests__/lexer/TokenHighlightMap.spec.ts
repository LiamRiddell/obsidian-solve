import { describe, expect, test } from "@jest/globals";
import { getTokenHighlightClass } from "@solve-js/lexer/TokenHighlightMap";

describe("TokenHighlightMap", () => {
  test("returns cm-solve-number for NUMBER", () => {
    expect(getTokenHighlightClass("NUMBER")).toBe("cm-solve-number");
  });

  test("returns cm-solve-keyword for PI", () => {
    expect(getTokenHighlightClass("PI")).toBe("cm-solve-keyword");
  });

  test("returns cm-solve-keyword for keywords", () => {
    const keywords = ["PI", "E", "NOW", "TODAY", "TOMORROW", "YESTERDAY", "ROLL", "OF",
      "DURATION_DAY", "DURATION_WEEK", "DURATION_MONTH", "DURATION_YEAR",
      "DURATION_HOUR", "DURATION_MINUTE", "DURATION_SECOND"];
    for (const kw of keywords) {
      expect(getTokenHighlightClass(kw)).toBe("cm-solve-keyword");
    }
  });

  test("returns cm-solve-operator for operators", () => {
    const operators = ["PLUS", "MINUS", "STAR", "SLASH", "CARET", "PERCENT",
      "LSHIFT", "RSHIFT", "EQUALS", "DOT", "COMMA", "INCREASE_BY", "DECREASE_BY"];
    for (const op of operators) {
      expect(getTokenHighlightClass(op)).toBe("cm-solve-operator");
    }
  });

  test("returns cm-solve-function for FUNC", () => {
    expect(getTokenHighlightClass("FUNC")).toBe("cm-solve-function");
  });

  test("returns cm-solve-variable for DOLLAR and COLON", () => {
    expect(getTokenHighlightClass("DOLLAR")).toBe("cm-solve-variable");
    expect(getTokenHighlightClass("COLON")).toBe("cm-solve-variable");
  });

  test("returns cm-solve-string for STRING", () => {
    expect(getTokenHighlightClass("STRING")).toBe("cm-solve-string");
  });

  test("returns cm-solve-unit for UNIT", () => {
    expect(getTokenHighlightClass("UNIT")).toBe("cm-solve-unit");
  });

  test("returns cm-solve-error for ERROR", () => {
    expect(getTokenHighlightClass("ERROR")).toBe("cm-solve-error");
  });

  test("returns undefined for WS and NEWLINE", () => {
    expect(getTokenHighlightClass("WS")).toBeUndefined();
    expect(getTokenHighlightClass("NEWLINE")).toBeUndefined();
  });

  test("returns undefined for IDENT", () => {
    expect(getTokenHighlightClass("IDENT")).toBeUndefined();
  });

  test("returns undefined for unknown token types", () => {
    expect(getTokenHighlightClass("UNKNOWN")).toBeUndefined();
    expect(getTokenHighlightClass("LPAREN")).toBeUndefined();
    expect(getTokenHighlightClass("RPAREN")).toBeUndefined();
  });
});
