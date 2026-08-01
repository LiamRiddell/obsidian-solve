import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("evaluateLines (batch API)", () => {
  test("empty array returns empty result", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines([]);
    expect(result).toEqual([]);
  });

  test("single expression line evaluates correctly", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["1 + 2"]);
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe("1 + 2");
    expect(result[0].result?.toNumber()).toBe(3);
    expect(result[0].isEmpty).toBe(false);
    expect(result[0].error).toBeNull();
  });

  test("multiple expression lines evaluate independently", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["10 + 5", "20 * 3", "100 / 4"]);
    expect(result).toHaveLength(3);
    expect(result[0].result?.toNumber()).toBe(15);
    expect(result[1].result?.toNumber()).toBe(60);
    expect(result[2].result?.toNumber()).toBe(25);
  });

  test("empty lines are marked as isEmpty", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["", "   ", "# ", "> "]);
    expect(result).toHaveLength(4);
    expect(result[0].isEmpty).toBe(true);
    expect(result[1].isEmpty).toBe(true);
    expect(result[2].isEmpty).toBe(true);
    expect(result[3].isEmpty).toBe(true);
  });

  test("inline solves are detected and evaluated", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["Result: s`1 + 2`"]);
    expect(result).toHaveLength(1);
    expect(result[0].hasInlineSolves).toBe(true);
    expect(result[0].inlineSolves).toHaveLength(1);
    expect(result[0].inlineSolves[0].expression).toBe("1 + 2");
    expect(result[0].inlineSolves[0].result?.toNumber()).toBe(3);
  });

  test("multiple inline solves in one line", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["s`1 + 2` and s`3 + 4`"]);
    expect(result).toHaveLength(1);
    expect(result[0].hasInlineSolves).toBe(true);
    expect(result[0].inlineSolves).toHaveLength(2);
    expect(result[0].inlineSolves[0].result?.toNumber()).toBe(3);
    expect(result[0].inlineSolves[1].result?.toNumber()).toBe(7);
  });

  test("variable assignments are recognized", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines([":x = 5", "x + 3"]);
    expect(result).toHaveLength(2);
    expect(result[0].expression).toBe(":x = 5");
    expect(result[1].result?.toNumber()).toBe(8);
  });

  test("errors are captured on lines", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["1 / 0", "foo + bar"]);
    expect(result).toHaveLength(2);
    // Division by zero may produce Infinity (not an error in JS semantics)
    // "foo + bar" should produce an error since those are undefined variables
    expect(result[1].error).toBeTruthy();
  });

  test("batch evaluation produces same results as parseDocument equivalent", () => {
    const engine = new ExpressionEngine("en", false);
    const lines = ["5 + 10", "20 - 7", "s`3 * 4`"];
    const batchResult = engine.evaluateLines(lines);

    // Use a fresh engine for parseDocument to get independent results
    const engine2 = new ExpressionEngine("en", false);
    const docText = lines.join("\n");
    const docResult = engine2.parseDocument(docText, { inputType: "markdown" });

    expect(batchResult).toHaveLength(docResult.lines.length);
    for (let i = 0; i < batchResult.length; i++) {
      expect(batchResult[i].expression).toBe(docResult.lines[i].expression);
      expect(batchResult[i].isEmpty).toBe(docResult.lines[i].isEmpty);
      expect(batchResult[i].hasInlineSolves).toBe(docResult.lines[i].hasInlineSolves);
      expect(batchResult[i].inlineSolves.length).toBe(docResult.lines[i].inlineSolves.length);
      if (batchResult[i].result && docResult.lines[i].result) {
        expect(batchResult[i].result!.toNumber()).toBe(docResult.lines[i].result!.toNumber());
      }
    }
  });

  test("mixed empty and expression lines", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLines(["1 + 1", "", "2 + 2", "# ", "3 + 3"]);
    expect(result).toHaveLength(5);
    expect(result[0].result?.toNumber()).toBe(2);
    expect(result[1].isEmpty).toBe(true);
    expect(result[2].result?.toNumber()).toBe(4);
    expect(result[3].isEmpty).toBe(true);
    expect(result[4].result?.toNumber()).toBe(6);
  });

  test("position tracking is correct for batch lines", () => {
    const engine = new ExpressionEngine("en", false);
    const lines = ["hello world", "abc"];
    const result = engine.evaluateLines(lines);
    expect(result).toHaveLength(2);
    expect(result[0].startPosition).toBe(0);
    expect(result[0].endPosition).toBe(11); // "hello world".length
    expect(result[1].startPosition).toBe(12); // previous end + 1
    expect(result[1].endPosition).toBe(15); // 12 + "abc".length
  });
});
