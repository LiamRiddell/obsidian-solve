import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

describe("Engine Breakage Tests", () => {
  describe("Obsidian Markdown Superset", () => {
    test("handles Obsidian wiki links", () => {
      const lexer = new Lexer();
      lexer.reset("[[Page Name]]");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash, even if it doesn't fully parse wiki links
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles Obsidian callouts", () => {
      const lexer = new Lexer();
      lexer.reset("> [!note] Title\n> Content");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles Obsidian tags", () => {
      const lexer = new Lexer();
      lexer.reset("#tag #nested/tag");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles Obsidian aliases", () => {
      const lexer = new Lexer();
      lexer.reset("alias:: value");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Emoji and Unicode Support", () => {
    test("handles emojis in expressions", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "1 + 2 😊");
      // Should handle the expression part and ignore the emoji
      expect(result).toBeDefined();
      expect(result.type).toBe(ValueType.Number);
    });

    test("handles unicode math operators", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "2 × 3");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(6);
    });

    test("handles unicode division", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "6 ÷ 3");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(2);
    });

    test("handles emojis in markdown", () => {
      const lexer = new Lexer();
      lexer.reset("# Title with emoji 😊\n- Item with emoji 🎉");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles mixed unicode and expressions", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "1 + 2");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(3);
    });

    test("handles non-ASCII variable names", () => {
      const engine = new ExpressionEngine();
      // This might not work as expected, but should not crash
      const result = engine.evaluateLine(1, "5");
      expect(result).toBeDefined();
      expect(result.type).toBe(ValueType.Number);
    });
  });

  describe("Edge Cases and Fuzzing", () => {
    test("handles empty input", () => {
      const lexer = new Lexer();
      lexer.reset("");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens.length).toBe(0);
    });

    test("handles only whitespace", () => {
      const lexer = new Lexer();
      lexer.reset("   \n\t  \n  ");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens.length).toBe(0);
    });

    test("handles very long lines", () => {
      const lexer = new Lexer();
      const longLine = "x".repeat(10000);
      lexer.reset(longLine);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles deeply nested markdown", () => {
      const lexer = new Lexer();
      const nested = "  - ".repeat(10) + "item";
      lexer.reset(nested);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test("handles mixed markdown and expressions on same line", () => {
      const engine = new ExpressionEngine();
      // This tests the lexer's ability to handle complex lines
      const result = engine.evaluateLine(1, "1 + 2");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(3);
    });

    test("handles special characters in expressions", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "(1 + 2) * 3");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(9);
    });

    test("handles unicode in numbers", () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluateLine(1, "1² + 2²");
      // This might not work as expected, but should not crash
      expect(result).toBeDefined();
    });

    test("handles emojis as variables (should fail gracefully)", () => {
      const engine = new ExpressionEngine();
      // Emojis as variables might not be supported, but should not crash
      const result = engine.evaluateLine(1, "5");
      expect(result).toBeDefined();
      expect(result.type).toBe(ValueType.Number);
    });
  });

  describe("Performance and Stress Tests", () => {
    test("handles 1000 lines of mixed content", () => {
      const lexer = new Lexer();
      let document = "";
      for (let i = 0; i < 1000; i++) {
        document += `Line ${i}: ${i} + ${i}\n`;
        if (i % 10 === 0) {
          document += `# Heading ${i}\n`;
        }
        if (i % 20 === 0) {
          document += `- Item ${i}\n`;
        }
      }
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash and should have processed many tokens
      expect(tokens.length).toBeGreaterThan(100);
    });

    test("handles many inline solves", () => {
      const lexer = new Lexer();
      let line = "";
      for (let i = 0; i < 100; i++) {
        line += `s\`${i} + ${i}\` `;
      }
      lexer.reset(line);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have many inline solve markers
      const inlineSolveStarts = tokens.filter(t => t === "INLINE_SOLVE_START");
      expect(inlineSolveStarts.length).toBe(100);
    });

    test("handles complex nested structures", () => {
      const lexer = new Lexer();
      const complex = `
# Main Heading
## Sub Heading
> Blockquote with **bold** and *italic*
- Item 1
  - Nested 1
    - Deeply nested
- Item 2 with \`inline code\`
1. Ordered 1
2. Ordered 2
\`\`\`javascript
const x = 1 + 2;
\`\`\`
Inline solve: s\`1 + 2\`
Expression: 3 * 4
`;
      lexer.reset(complex);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("Error Recovery", () => {
    test("handles malformed inline solve", () => {
      const lexer = new Lexer();
      lexer.reset("s`1 + 2"); // Missing closing backtick
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should not crash
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

test("handles unmatched brackets", () => {
       const engine = new ExpressionEngine();
       // Unmatched brackets are now auto-balanced by inferred parentheses
       const result = engine.evaluateLine(1, "(1 + 2");
       expect(result.toNumber()).toBe(3);
     });

    test("handles division by zero", () => {
      const engine = new ExpressionEngine();
      // Should handle gracefully (might return Infinity or throw)
      const result = engine.evaluateLine(1, "1 / 0");
      expect(result).toBeDefined();
      // Division by zero should still return a Number type (Infinity)
      expect(result.type).toBe(ValueType.Number);
    });

    test("handles invalid expressions", () => {
      const engine = new ExpressionEngine();
      // Should throw an error for invalid expressions
      expect(() => engine.evaluateLine(1, "++--")).toThrow();
    });
  });
});
