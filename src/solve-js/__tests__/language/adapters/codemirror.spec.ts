import { describe, expect, test } from "@jest/globals";
import { categoryClassName } from "@solve-js/language/adapters/codemirror";

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
