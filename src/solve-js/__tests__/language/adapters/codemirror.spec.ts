import { describe, expect, test } from "@jest/globals";
import { categoryClassName, completionItemToOption } from "@solve-js/language/adapters/codemirror";

describe("codemirror adapter — categoryClassName", () => {
  test("prefixes built-in categories with cm-solve-", () => {
    expect(categoryClassName("number")).toBe("cm-solve-number");
    expect(categoryClassName("string")).toBe("cm-solve-string");
    expect(categoryClassName("keyword")).toBe("cm-solve-keyword");
    expect(categoryClassName("operator")).toBe("cm-solve-operator");
    expect(categoryClassName("comparison")).toBe("cm-solve-comparison");
    expect(categoryClassName("bitwise")).toBe("cm-solve-bitwise");
    expect(categoryClassName("function")).toBe("cm-solve-function");
    expect(categoryClassName("variable")).toBe("cm-solve-variable");
    expect(categoryClassName("unit")).toBe("cm-solve-unit");
    expect(categoryClassName("datetime")).toBe("cm-solve-datetime");
    expect(categoryClassName("vector")).toBe("cm-solve-vector");
    expect(categoryClassName("punctuation")).toBe("cm-solve-punctuation");
    expect(categoryClassName("error")).toBe("cm-solve-error");
  });

  test("works for arbitrary plugin-contributed category strings with no adapter changes needed", () => {
    expect(categoryClassName("osrs-item")).toBe("cm-solve-osrs-item");
    expect(categoryClassName("anything-a-future-package-invents")).toBe(
      "cm-solve-anything-a-future-package-invents"
    );
  });
});

describe("codemirror adapter — completionItemToOption", () => {
  test("maps each mapped category to its CM6 completion type", () => {
    expect(completionItemToOption({ label: "pi", category: "keyword" })).toEqual({ label: "pi", type: "keyword", detail: undefined });
    expect(completionItemToOption({ label: "sqrt", category: "function" })).toEqual({ label: "sqrt", type: "function", detail: undefined });
    expect(completionItemToOption({ label: "x", category: "variable" })).toEqual({ label: "x", type: "variable", detail: undefined });
    expect(completionItemToOption({ label: "km", category: "unit", detail: "length" })).toEqual({ label: "km", type: "type", detail: "length" });
    expect(completionItemToOption({ label: "now", category: "datetime" })).toEqual({ label: "now", type: "keyword", detail: undefined });
    expect(completionItemToOption({ label: "vec2", category: "vector" })).toEqual({ label: "vec2", type: "type", detail: undefined });
    expect(completionItemToOption({ label: "==", category: "comparison" })).toEqual({ label: "==", type: "keyword", detail: undefined });
    expect(completionItemToOption({ label: "&", category: "bitwise" })).toEqual({ label: "&", type: "keyword", detail: undefined });
    expect(completionItemToOption({ label: "+", category: "operator" })).toEqual({ label: "+", type: "keyword", detail: undefined });
  });

  test("falls back to 'text' for unmapped categories, including plugin-contributed ones", () => {
    expect(completionItemToOption({ label: "Iron Axe", category: "osrs-item", detail: "OSRS item" })).toEqual({
      label: "Iron Axe",
      type: "text",
      detail: "OSRS item",
    });
    expect(completionItemToOption({ label: "5", category: "number" })).toEqual({ label: "5", type: "text", detail: undefined });
  });

  test("preserves detail when present", () => {
    expect(completionItemToOption({ label: "km", category: "unit", detail: "length" }).detail).toBe("length");
  });
});
