import { test, expect, describe } from "@jest/globals";
import { runEngine } from "../engine";
import { prepareEvaluationInput } from "../engineShared";

/**
 * Line/result tracking robustness — adversarial coverage.
 *
 * Root bug (reported live): typing blank lines above an existing
 * expression left its result widget stuck on the original (now blank)
 * line instead of following the expression down. Root cause:
 * EditorPane.vue called `.trim()` on the WHOLE multi-line document
 * before handing it to the engine, silently stripping leading blank
 * lines — every downstream lineNumber (split on "\n", 1-based index) is
 * only ever as correct as the text it was computed from, so trimming
 * blank lines off the front desynced the reported lineNumber from the
 * expression's actual position in the document CodeMirror was showing.
 *
 * `runEngine()`'s own per-line loop was, and is, correct on its own —
 * confirmed directly below — the bug lived entirely in what got handed
 * to it. Both halves are covered here: prepareEvaluationInput() (the
 * actual fix) and runEngine() itself (broad regression coverage so this
 * class of bug can't creep back in from either side).
 */

describe("prepareEvaluationInput", () => {
  test("passes a normal single-line document through unchanged", () => {
    expect(prepareEvaluationInput("10 + 5")).toBe("10 + 5");
  });

  test("passes a normal multi-line document through unchanged", () => {
    const doc = "10 + 5\n20 + 5\n30 + 5";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("preserves leading blank lines before an expression — the reported bug", () => {
    const doc = "\n\n\nroll(1, 6) + roll(1, 6)";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("preserves a single leading blank line", () => {
    const doc = "\n10 + 5";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("preserves trailing blank lines", () => {
    const doc = "10 + 5\n\n\n";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("preserves leading blank lines made of spaces/tabs, not just newlines", () => {
    const doc = "   \n\t\n10 + 5";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("preserves inline leading/trailing spaces on a real line", () => {
    const doc = "   10 + 5   ";
    expect(prepareEvaluationInput(doc)).toBe(doc);
  });

  test("collapses an empty document to ''", () => {
    expect(prepareEvaluationInput("")).toBe("");
  });

  test("collapses a whitespace-only document to ''", () => {
    expect(prepareEvaluationInput("   ")).toBe("");
    expect(prepareEvaluationInput("\n\n\n")).toBe("");
    expect(prepareEvaluationInput("\t\n  \n\t")).toBe("");
  });
});

describe("runEngine — line/result tracking", () => {
  test("a single expression on line 1 reports lineNumber 1", () => {
    const r = runEngine("10 + 5");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(1);
    expect(r.lineResults[0].result).toBe("= 15");
  });

  test("sequential lines with no gaps report sequential lineNumbers in order", () => {
    const r = runEngine("10 + 5\n20 + 5\n30 + 5");
    expect(r.lineResults.map(l => l.lineNumber)).toEqual([1, 2, 3]);
    expect(r.lineResults.map(l => l.result)).toEqual(["= 15", "= 25", "= 35"]);
  });

  test("one leading blank line shifts the expression's reported lineNumber to 2", () => {
    const r = runEngine("\n10 + 5");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(2);
  });

  test("multiple leading blank lines — lineNumber matches the exact count + 1 (the reported bug's exact shape)", () => {
    for (const blankCount of [1, 2, 3, 5, 10]) {
      const doc = "\n".repeat(blankCount) + "10 + 5";
      const r = runEngine(doc);
      expect(r.lineResults).toHaveLength(1);
      expect(r.lineResults[0].lineNumber).toBe(blankCount + 1);
    }
  });

  test("leading blank lines made of whitespace (not just empty newlines) still shift lineNumber correctly", () => {
    const r = runEngine("   \n\t\n10 + 5");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(3);
  });

  test("trailing blank lines don't add spurious results or corrupt earlier lineNumbers", () => {
    const r = runEngine("10 + 5\n\n\n");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(1);
  });

  test("a single trailing newline (the common 'file ends with newline' case) adds no spurious result", () => {
    const r = runEngine("10 + 5\n");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(1);
  });

  test("a blank gap BETWEEN two expressions — both report correct, non-adjacent lineNumbers", () => {
    const r = runEngine("10 + 5\n\n\n20 + 5");
    expect(r.lineResults).toHaveLength(2);
    expect(r.lineResults[0].lineNumber).toBe(1);
    expect(r.lineResults[1].lineNumber).toBe(4);
  });

  test("multiple expressions separated by varying blank-line gaps all report correct lineNumbers", () => {
    const doc = [
      "10 + 5",   // 1
      "",         // 2
      "20 + 5",   // 3
      "",         // 4
      "",         // 5
      "",         // 6
      "30 + 5",   // 7
    ].join("\n");
    const r = runEngine(doc);
    expect(r.lineResults.map(l => l.lineNumber)).toEqual([1, 3, 7]);
  });

  test("blank lines shift lineNumbers correctly even when a later expression references an earlier variable", () => {
    const doc = [
      "",           // 1 (blank)
      "",           // 2 (blank)
      ":x = 10",    // 3
      "",           // 4 (blank)
      "",           // 5 (blank)
      "",           // 6 (blank)
      "x + 5",      // 7
    ].join("\n");
    const r = runEngine(doc);
    expect(r.lineResults.map(l => l.lineNumber)).toEqual([3, 7]);
    expect(r.lineResults[0].result).toBe("= 10");
    expect(r.lineResults[1].result).toBe("= 15"); // proves the blank gap didn't break variable resolution either
  });

  test("the exact same expression appearing on two different lines each gets its own correctly-numbered result (no dedup/confusion)", () => {
    const r = runEngine("10 + 5\n\n10 + 5");
    expect(r.lineResults).toHaveLength(2);
    expect(r.lineResults[0].lineNumber).toBe(1);
    expect(r.lineResults[1].lineNumber).toBe(3);
    expect(r.lineResults[0].result).toBe(r.lineResults[1].result);
  });

  test("moving the same expression to a later line (simulating blank lines typed above it) reports the NEW line, not the old one", () => {
    const before = runEngine("10 + 5 * 2");
    expect(before.lineResults[0].lineNumber).toBe(1);

    const after = runEngine("\n\n\n10 + 5 * 2");
    expect(after.lineResults[0].lineNumber).toBe(4);
    expect(after.lineResults[0].result).toBe(before.lineResults[0].result);
  });

  test("a markdown heading before an expression doesn't corrupt the expression's lineNumber", () => {
    const doc = "# Heading\n10 + 5";
    const r = runEngine(doc);
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(2);
  });

  test("a comment line before an expression doesn't corrupt the expression's lineNumber", () => {
    const doc = "// just a note\n10 + 5";
    const r = runEngine(doc);
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(2);
  });

  test("an expression with inline leading/trailing spaces still reports the correct lineNumber", () => {
    const r = runEngine("\n   10 + 5   ");
    expect(r.lineResults).toHaveLength(1);
    expect(r.lineResults[0].lineNumber).toBe(2);
    expect(r.lineResults[0].result).toBe("= 15");
  });

  test("an entirely blank/whitespace-only document produces zero lineResults, no crash", () => {
    expect(runEngine("").lineResults).toEqual([]);
    expect(runEngine("   ").lineResults).toEqual([]);
    expect(runEngine("\n\n\n").lineResults).toEqual([]);
    expect(runEngine("\t\n  \n\t").lineResults).toEqual([]);
  });

  test("deleting an expression (leaving only what's above/below it) renumbers the remaining lines correctly on the next run", () => {
    const withThree = runEngine("10 + 5\n20 + 5\n30 + 5");
    expect(withThree.lineResults.map(l => l.lineNumber)).toEqual([1, 2, 3]);

    // Simulate deleting the middle line's content (now blank).
    const withMiddleDeleted = runEngine("10 + 5\n\n30 + 5");
    expect(withMiddleDeleted.lineResults.map(l => l.lineNumber)).toEqual([1, 3]);
  });

  test("a fully deterministic multi-line document with many blank-line variations round-trips every lineNumber exactly", () => {
    const doc = [
      "",              // 1
      "1 + 1",         // 2
      "",              // 3
      "",              // 4
      "2 + 2",         // 5
      "3 + 3",         // 6
      "",              // 7
      "4 + 4",         // 8
    ].join("\n");
    const r = runEngine(doc);
    expect(r.lineResults.map(l => l.lineNumber)).toEqual([2, 5, 6, 8]);
    expect(r.lineResults.map(l => l.result)).toEqual(["= 2", "= 4", "= 6", "= 8"]);
  });
});
