import { beforeEach, describe, expect, test } from "@jest/globals";
import { SolveHighlightProvider } from "@/codemirror/SolveHighlightProvider";

describe("SolveHighlightProvider", () => {
  let provider: SolveHighlightProvider;

  beforeEach(() => {
    provider = new SolveHighlightProvider();
  });

  test("simple expression 1 + 2 produces 3 highlights: NUMBER, PLUS, NUMBER", () => {
    const ranges = provider.getLineHighlights("1 + 2");
    expect(ranges).toHaveLength(3);
    expect(ranges[0].className).toBe("cm-solve-number");
    expect(ranges[1].className).toBe("cm-solve-operator");
    expect(ranges[2].className).toBe("cm-solve-number");
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].to).toBe(1);
    expect(ranges[1].from).toBe(2);
    expect(ranges[1].to).toBe(3);
    expect(ranges[2].from).toBe(4);
    expect(ranges[2].to).toBe(5);
  });

  test("keyword pi produces PI highlighted as keyword", () => {
    const ranges = provider.getLineHighlights("pi");
    expect(ranges).toHaveLength(1);
    expect(ranges[0].className).toBe("cm-solve-keyword");
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].to).toBe(2);
  });

  test("function call sqrt(4) highlights FUNC and NUMBER", () => {
    const ranges = provider.getLineHighlights("sqrt(4)");
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    const funcRange = ranges.find(r => r.className === "cm-solve-function");
    const numRange = ranges.find(r => r.className === "cm-solve-number");
    expect(funcRange).toBeDefined();
    expect(numRange).toBeDefined();
    expect(funcRange!.from).toBe(0);
    expect(funcRange!.to).toBe(4);
  });

  test("invalid syntax {{{ produces no highlights", () => {
    const ranges = provider.getLineHighlights("{{{");
    expect(ranges).toHaveLength(0);
  });

  test("variable :x highlights COLON as variable", () => {
    const ranges = provider.getLineHighlights(":x");
    expect(ranges.length).toBeGreaterThanOrEqual(1);
    const colonRange = ranges.find(r => r.className === "cm-solve-variable");
    expect(colonRange).toBeDefined();
    expect(colonRange!.from).toBe(0);
    expect(colonRange!.to).toBe(1);
  });

  test("dollar with currency parselet produces highlights", () => {
    const ranges = provider.getLineHighlights("$x");
    expect(ranges.length).toBeGreaterThanOrEqual(1);
    expect(ranges[0].className).toBe("cm-solve-variable");
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].to).toBe(1);
  });

  test("completely invalid text produces no highlights", () => {
    const ranges = provider.getLineHighlights("invalid {{{ }}}");
    expect(ranges).toHaveLength(0);
  });

  test("padding/whitespace: '  1 + 2' has correct offset mapping", () => {
    const ranges = provider.getLineHighlights("  1 + 2");
    expect(ranges).toHaveLength(3);
    expect(ranges[0].from).toBe(2);
    expect(ranges[0].to).toBe(3);
    expect(ranges[1].from).toBe(4);
    expect(ranges[1].to).toBe(5);
    expect(ranges[2].from).toBe(6);
    expect(ranges[2].to).toBe(7);
  });

  test("multiple operators highlighted correctly", () => {
    const ranges = provider.getLineHighlights("3 + 4 * 5");
    expect(ranges).toHaveLength(5);
    expect(ranges[0].className).toBe("cm-solve-number");
    expect(ranges[1].className).toBe("cm-solve-operator");
    expect(ranges[2].className).toBe("cm-solve-number");
    expect(ranges[3].className).toBe("cm-solve-operator");
    expect(ranges[4].className).toBe("cm-solve-number");
  });

  test("parenthesized expression highlights correctly", () => {
    const ranges = provider.getLineHighlights("(1 + 2)");
    expect(ranges).toHaveLength(3);
    expect(ranges[0].className).toBe("cm-solve-number");
    expect(ranges[1].className).toBe("cm-solve-operator");
    expect(ranges[2].className).toBe("cm-solve-number");
  });

  test("pi keyword with assignment parses as variable write", () => {
    const ranges = provider.getLineHighlights(":x = pi");
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    expect(ranges[0].className).toBe("cm-solve-variable");
    expect(ranges[1].className).toBe("cm-solve-operator");
  });

  test("caches results for repeated calls", () => {
    const first = provider.getLineHighlights("1 + 2");
    const second = provider.getLineHighlights("1 + 2");
    expect(first).toEqual(second);
  });

  test("invalidateCache clears all cached results", () => {
    provider.getLineHighlights("1 + 2");
    provider.invalidateCache();
    const after = provider.getLineHighlights("1 + 2");
    expect(after).toEqual([{ from: 0, to: 1, className: "cm-solve-number" }, { from: 2, to: 3, className: "cm-solve-operator" }, { from: 4, to: 5, className: "cm-solve-number" }]);
  });

  test("inline solve expression s`1 + 2` is tokenized correctly", () => {
    const ranges = provider.getLineHighlights("s`1 + 2`");
    // The lexer should tokenize the expression inside the backticks
    // The BACKTICK_OPEN and BACKTICK_CLOSE tokens should be filtered out
    // The expression tokens (NUMBER, PLUS, NUMBER) should be highlighted
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
    const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
    expect(numberRanges.length).toBeGreaterThanOrEqual(2);
    expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
  });

  test("inline solve expression with multiple operations", () => {
    const ranges = provider.getLineHighlights("s`1 + 2 * 3`");
    expect(ranges.length).toBeGreaterThanOrEqual(5);
    const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
    const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
    expect(numberRanges.length).toBeGreaterThanOrEqual(3);
    expect(operatorRanges.length).toBeGreaterThanOrEqual(2);
  });

  test("inline solve expression with function call", () => {
    const ranges = provider.getLineHighlights("s`sqrt(4)`");
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    const funcRange = ranges.find(r => r.className === "cm-solve-function");
    const numRange = ranges.find(r => r.className === "cm-solve-number");
    expect(funcRange).toBeDefined();
    expect(numRange).toBeDefined();
  });

  test("markdown list marker is filtered out", () => {
    // The lexer should detect the list marker and filter it out
    // Only the expression tokens should be highlighted
    const ranges = provider.getLineHighlights("- 1 + 2");
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
    const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
    expect(numberRanges.length).toBeGreaterThanOrEqual(2);
    expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
  });

  test("markdown heading marker is filtered out", () => {
    // The lexer should detect the heading marker and filter it out
    // The heading content should not be highlighted
    const ranges = provider.getLineHighlights("# Heading");
    // Since "Heading" is not a valid expression, no ranges should be highlighted
    expect(ranges).toHaveLength(0);
  });

  test("blockquote marker is filtered out", () => {
    // The lexer should detect the blockquote marker and filter it out
    // Only the expression tokens should be highlighted
    const ranges = provider.getLineHighlights("> 1 + 2");
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
    const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
    expect(numberRanges.length).toBeGreaterThanOrEqual(2);
    expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
  });
});