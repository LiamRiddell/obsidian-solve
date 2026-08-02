import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import type { MatrixData } from "@solve-js/vm/Value";

describe("ExpressionEngine - Line Tracking and Position Tracking", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en");
  });

  describe("Single-line expressions with precise coordinate tracking", () => {
    test("tracks position of simple inline solve", () => {
      const result = engine.parseDocument("s`1 + 2`", { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].inlineSolves).toHaveLength(1);
      
      const solve = result.lines[0].inlineSolves[0];
      expect(solve.start).toBe(0);
      expect(solve.end).toBe(8); // "s`1 + 2`".length
      expect(solve.lineNumber).toBe(1);
      expect(solve.columnNumber).toBe(1);
      expect(solve.expression).toBe("1 + 2");
    });

    test("tracks multiple inline solves on same line with correct positions", () => {
      const result = engine.parseDocument("s`1 + 2` and s`3 + 4`", { inputType: 'markdown' });
      
      expect(result.lines[0].inlineSolves).toHaveLength(2);
      
      const firstSolve = result.lines[0].inlineSolves[0];
      expect(firstSolve.start).toBe(0);
      expect(firstSolve.expression).toBe("1 + 2");
      expect(firstSolve.result?.toNumber()).toBe(3);
      
      const secondSolve = result.lines[0].inlineSolves[1];
      expect(secondSolve.start).toBe(13); // "s`1 + 2` and ".length
      expect(secondSolve.expression).toBe("3 + 4");
      expect(secondSolve.result?.toNumber()).toBe(7);
    });

    test("tracks position of regular expression (no inline solve)", () => {
      const result = engine.parseDocument("1 + 2 + 3", { inputType: 'markdown' });
      
      expect(result.lines[0].hasInlineSolves).toBe(false);
      expect(result.lines[0].expression).toBe("1 + 2 + 3");
      expect(result.lines[0].result?.toNumber()).toBe(6);
      expect(result.lines[0].startPosition).toBe(0);
      expect(result.lines[0].endPosition).toBe(9);
    });
  });

  describe("Multi-line expressions with mixed content", () => {
    test("tracks positions across multiple lines with inline solves", () => {
      const document = `s\`1 + 2\`
s\`3 + 4\`
s\`5 + 6\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.totalLines).toBe(3);
      
      // Line 1
      expect(result.lines[0].lineNumber).toBe(1);
      expect(result.lines[0].inlineSolves).toHaveLength(1);
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(3);
      
      // Line 2
      expect(result.lines[1].lineNumber).toBe(2);
      expect(result.lines[1].inlineSolves).toHaveLength(1);
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(7);
      
      // Line 3
      expect(result.lines[2].lineNumber).toBe(3);
      expect(result.lines[2].inlineSolves).toHaveLength(1);
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(11);
    });

    test("tracks positions with mixed inline solves and regular expressions", () => {
      const document = `s\`1 + 2\`
10 + 20
s\`30 + 40\`
50 * 2`;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(4);
      
      // Line 1: inline solve
      expect(result.lines[0].hasInlineSolves).toBe(true);
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(3);
      
      // Line 2: regular expression
      expect(result.lines[1].hasInlineSolves).toBe(false);
      expect(result.lines[1].expression).toBe("10 + 20");
      expect(result.lines[1].result?.toNumber()).toBe(30);
      
      // Line 3: inline solve
      expect(result.lines[2].hasInlineSolves).toBe(true);
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(70);
      
      // Line 4: regular expression
      expect(result.lines[3].hasInlineSolves).toBe(false);
      expect(result.lines[3].expression).toBe("50 * 2");
      expect(result.lines[3].result?.toNumber()).toBe(100);
    });

    test("tracks positions with variables across lines", () => {
      const document = `:x = 10
s\`:x + 5\`
:y = :x * 2
s\`:x + :y\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(4);
      
      // Line 1: variable assignment
      expect(result.lines[0].expression).toBe(":x = 10");
      expect(result.lines[0].result?.toNumber()).toBe(10);
      
      // Line 2: inline solve with variable
      expect(result.lines[1].inlineSolves[0].expression).toBe(":x + 5");
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(15);
      
      // Line 3: variable assignment with expression
      expect(result.lines[2].expression).toBe(":y = :x * 2");
      expect(result.lines[2].result?.toNumber()).toBe(20);
      
      // Line 4: inline solve with multiple variables
      expect(result.lines[3].inlineSolves[0].expression).toBe(":x + :y");
      expect(result.lines[3].inlineSolves[0].result?.toNumber()).toBe(30);
    });

    test("handles empty lines correctly in multi-line document", () => {
      const document = `s\`1 + 2\`

s\`3 + 4\`

5 + 6`;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(5);
      
      // Line 1: inline solve
      expect(result.lines[0].isEmpty).toBe(false);
      expect(result.lines[0].inlineSolves).toHaveLength(1);
      
      // Line 2: empty
      expect(result.lines[1].isEmpty).toBe(true);
      expect(result.lines[1].hasInlineSolves).toBe(false);
      
      // Line 3: inline solve
      expect(result.lines[2].isEmpty).toBe(false);
      expect(result.lines[2].inlineSolves).toHaveLength(1);
      
      // Line 4: empty
      expect(result.lines[3].isEmpty).toBe(true);
      
      // Line 5: regular expression
      expect(result.lines[4].isEmpty).toBe(false);
      expect(result.lines[4].expression).toBe("5 + 6");
    });
  });

  describe("Edge cases and error handling", () => {
    test("handles inline solve with syntax error", () => {
      const result = engine.parseDocument("s`1 + `", { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].inlineSolves).toHaveLength(1);
      expect(result.lines[0].inlineSolves[0].error).toBeDefined();
      expect(result.errors).toHaveLength(1);
    });

    test("handles regular expression with syntax error", () => {
      const result = engine.parseDocument("1 + ", { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].error).toBeDefined();
      expect(result.errors).toHaveLength(1);
    });

    test("handles empty document", () => {
      const result = engine.parseDocument("", { inputType: 'markdown' });
      
      // An empty document has 0 lines — scanDocument('') returns [],
      // not [empty line] (unlike the old split('\n') which produced ['']).
      expect(result.lines).toHaveLength(0);
      expect(result.totalLines).toBe(0);
    });

    test("handles document with only whitespace", () => {
      const result = engine.parseDocument("   \n\t\n  ", { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.lines.every(line => line.isEmpty)).toBe(true);
    });

    test("handles document with markdown-only lines", () => {
      const result = engine.parseDocument("# \n// comment\n> ", { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.lines.every(line => line.isEmpty)).toBe(true);
    });

    test("tracks positions with complex nested expressions", () => {
      const document = `s\`(1 + 2) * (3 + 4)\`
s\`sqrt(16) + pow(2, 3)\`
s\`10% of 100 + 50\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(21); // (1+2)*(3+4) = 3*7 = 21
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(12); // sqrt(16) + pow(2,3) = 4 + 8 = 12
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(60); // 10% of 100 + 50 = 10 + 50 = 60
    });

    test("handles inline solves with different expression types", () => {
      const document = `s\`$100 + $50\`
s\`vec2(1, 2) + vec2(3, 4)\`
s\`10 kg + 5 kg\`
s\`10% of $200\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(4);
      
      // Currency
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(150);
      
      // Vector
      const vecResult = result.lines[1].inlineSolves[0].result;
      expect(vecResult?.isMatrix()).toBe(true);
      expect((vecResult?.value as MatrixData).data).toEqual([4, 6]);
      
      // UOM
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(15);
      
      // Percentage
      expect(result.lines[3].inlineSolves[0].result?.toNumber()).toBe(20);
    });

    test("tracks precise coordinates in large document", () => {
      const lines = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`s\`${i} + ${i}\``);
      }
      const document = lines.join('\n');
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.totalLines).toBe(100);
      expect(result.lines).toHaveLength(100);
      
      // Verify each line has correct position and result
      result.lines.forEach((line, index) => {
        expect(line.lineNumber).toBe(index + 1);
        expect(line.inlineSolves).toHaveLength(1);
        expect(line.inlineSolves[0].lineNumber).toBe(index + 1);
        expect(line.inlineSolves[0].result?.toNumber()).toBe((index + 1) * 2);
      });
    });

    test("handles overlapping inline solves (should not happen in practice, but test robustness)", () => {
      // This tests that the regex correctly handles backticks
      const result = engine.parseDocument("s`1 + 2` s`3 + 4`", { inputType: 'markdown' });
      
      expect(result.lines[0].inlineSolves).toHaveLength(2);
      expect(result.lines[0].inlineSolves[0].expression).toBe("1 + 2");
      expect(result.lines[0].inlineSolves[1].expression).toBe("3 + 4");
    });
  });

  describe("Integration with existing functionality", () => {
    test("parseDocument produces same results as evaluateLine for simple expressions", () => {
      const expressions = ["1 + 2", "10 * 5", "100 / 4", "5 - 3"];
      
      expressions.forEach(expr => {
        const [directResult] = engine.evaluateLine(1, expr);
        const documentResult = engine.parseDocument(expr, { inputType: 'markdown' });
        
        expect(documentResult.lines[0].result?.toNumber()).toBe(directResult.toNumber());
      });
    });

    test("parseDocument handles mixed markdown and expressions", () => {
      const document = `# 
s\`1 + 2\`
Regular text with s\`3 + 4\` inline solve
- List item with s\`5 + 6\`
7 + 8`;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(5);
      
      // Line 1: markdown heading (empty)
      expect(result.lines[0].isEmpty).toBe(true);
      
      // Line 2: inline solve
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(3);
      
      // Line 3: text with inline solve
      expect(result.lines[2].inlineSolves).toHaveLength(1);
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(7);
      
      // Line 4: list item with inline solve
      expect(result.lines[3].inlineSolves[0].result?.toNumber()).toBe(11);
      
      // Line 5: bare expression (replaced blockquote since blockquotes always skip)
      expect(result.lines[4].expression).toBe("7 + 8");
      expect(result.lines[4].result?.toNumber()).toBe(15);
    });
  });
});
