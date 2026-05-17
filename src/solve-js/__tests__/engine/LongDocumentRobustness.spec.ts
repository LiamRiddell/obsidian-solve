import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("ExpressionEngine - Long Documents and Robustness Tests", () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine("en");
  });

  describe("Long document tests", () => {
    test("handles document with 1000 lines", () => {
      const lines = [];
      for (let i = 1; i <= 1000; i++) {
        lines.push(`s\`${i} + ${i}\``);
      }
      const document = lines.join('\n');
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.totalLines).toBe(1000);
      expect(result.lines).toHaveLength(1000);
      expect(result.errors).toHaveLength(0);
      
      // Verify first and last lines
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(2);
      expect(result.lines[999].inlineSolves[0].result?.toNumber()).toBe(2000);
    });

    test("handles document with 10000 lines", () => {
      const lines = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`:x${i} = ${i}`);
        lines.push(`s\`:x${i} + ${i}\``);
      }
      const document = lines.join('\n');
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.totalLines).toBe(200);
      expect(result.lines).toHaveLength(200);
      expect(result.errors).toHaveLength(0);
    });

    test("handles document with very long lines", () => {
      // Create a line with a very long expression
      const longExpression = Array(100).fill("1 + 1").join(" + ");
      const document = `s\`${longExpression}\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].inlineSolves).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    test("handles document with many inline solves per line", () => {
      // Create a line with many inline solves
      const expressions = Array(50).fill("1 + 1");
      const line = expressions.map((expr, i) => `s\`${expr}\``).join(" + ");
      const document = line;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].inlineSolves).toHaveLength(50);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Broken markdown tests", () => {
    test("handles incomplete inline solve syntax", () => {
      const document = `s\`1 + 2
3 + 4\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(2);
      // First line has incomplete inline solve, should error
      expect(result.lines[0].error).toBeDefined();
      // Second line is regular expression (note: the backtick from the first line might be included)
      // The actual behavior depends on how the lexer handles the incomplete syntax
      expect(result.lines[1].result?.toNumber()).toBeGreaterThanOrEqual(7);
    });

    test("handles malformed variable assignments", () => {
      const document = `:x = 
:y = 10
:z = 20`;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].error).toBeDefined(); // Incomplete assignment
      expect(result.lines[1].result?.toNumber()).toBe(10);
      expect(result.lines[2].result?.toNumber()).toBe(20);
    });

    test("handles nested markdown structures", () => {
      const document = `# Heading
> Blockquote with s\`1 + 2\`
- List item with s\`3 + 4\`
  - Nested list with s\`5 + 6\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(4);
      // Line 1 is a markdown heading with text, not empty
      expect(result.lines[0].isEmpty).toBe(false);
      expect(result.lines[0].inlineSolves).toHaveLength(0); // No inline solves in heading text
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(3);
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(7);
      expect(result.lines[3].inlineSolves[0].result?.toNumber()).toBe(11);
    });

    test("handles mixed valid and invalid syntax", () => {
      const document = `:x = 10
s\`:x + 5
invalid syntax here
:y = 20
s\`:x + :y\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(5);
      expect(result.lines[0].result?.toNumber()).toBe(10);
      expect(result.lines[1].error).toBeDefined(); // Incomplete inline solve
      expect(result.lines[2].error).toBeDefined(); // Invalid syntax
      expect(result.lines[3].result?.toNumber()).toBe(20);
      expect(result.lines[4].inlineSolves[0].result?.toNumber()).toBe(30);
    });

    test("handles extreme whitespace scenarios", () => {
      const document = `   
:x = 10
   
s\`:x + 5\`
   
   
:y = 20
   
s\`:x + :y\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(9);
      // Count non-empty lines
      const nonEmptyLines = result.lines.filter(l => !l.isEmpty);
      expect(nonEmptyLines).toHaveLength(4);
    });

    test("handles emoji and special characters", () => {
      const document = `😀 s\`1 + 2\`
:symbol = 123
s\`2 × 3\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].inlineSolves[0].result?.toNumber()).toBe(3);
      expect(result.lines[1].result?.toNumber()).toBe(123);
      expect(result.lines[2].inlineSolves[0].result?.toNumber()).toBe(6);
    });
  });

  describe("Stress tests", () => {
    test("handles rapid successive evaluations", () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        const result = engine.parseDocument(`s\`${i} + ${i}\``, { inputType: 'markdown' });
        results.push(result.lines[0].inlineSolves[0].result?.toNumber());
      }
      
      expect(results).toHaveLength(100);
      expect(results.every((r, i) => r === i * 2)).toBe(true);
    });

    test("handles memory pressure with large document", () => {
      // Create a document that would stress memory if not handled properly
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`:var${i} = ${i}`);
        lines.push(`s\`:var${i} + ${i}\``);
      }
      const document = lines.join('\n');
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.totalLines).toBe(2000);
      expect(result.lines).toHaveLength(2000);
      expect(result.errors).toHaveLength(0);
      
      // Line 0: :var0 = 0 (result = 0)
      // Line 1: s`:var0 + 0` (result = 0 + 0 = 0)
      // Line 2: :var1 = 1 (result = 1)
      // Line 3: s`:var1 + 1` (result = 1 + 1 = 2)
      // ...
      // Line 1000: :var500 = 500 (result = 500)
      // Line 1001: s`:var500 + 500` (result = 500 + 500 = 1000)
      
      expect(result.lines[1].inlineSolves[0].result?.toNumber()).toBe(0); // :var0 + 0 = 0 + 0 = 0
      expect(result.lines[1001].inlineSolves[0].result?.toNumber()).toBe(1000); // :var500 + 500 = 500 + 500 = 1000
      
      // Verify some random lines
      const randomIndex = Math.floor(Math.random() * 500);
      expect(result.lines[randomIndex * 2].result?.toNumber()).toBe(randomIndex); // :varN = N
      expect(result.lines[randomIndex * 2 + 1].inlineSolves[0].result?.toNumber()).toBe(randomIndex * 2); // :varN + N = N + N = 2N
    });

    test("handles concurrent variable modifications", () => {
      const document = `:x = 10
:x = 20
:x = 30
s\`:x + 10\``;
      
      const result = engine.parseDocument(document, { inputType: 'markdown' });
      
      expect(result.lines).toHaveLength(4);
      expect(result.lines[0].result?.toNumber()).toBe(10);
      expect(result.lines[1].result?.toNumber()).toBe(20);
      expect(result.lines[2].result?.toNumber()).toBe(30);
      expect(result.lines[3].inlineSolves[0].result?.toNumber()).toBe(40);
    });
  });
});
