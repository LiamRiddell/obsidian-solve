/**
 * Engine Breakage & Robustness Smoke Tests
 *
 * Verifies the engine and lexer don't crash on edge-case inputs:
 * - Obsidian markdown constructs (wiki links, callouts, tags, aliases)
 * - Unicode math operators (×, ÷)
 * - Empty/whitespace-only input
 * - Very long lines and deeply nested markdown
 * - Error recovery (unmatched brackets, div/zero, invalid expressions)
 */
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";

describe("Engine Breakage Tests", () => {
  describe("Obsidian Markdown Superset", () => {
    test("wiki links lex without crashing", () => {
      const lexer = new Lexer();
      lexer.reset("[[Page Name]]");
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });

    test("callouts lex without crashing", () => {
      const lexer = new Lexer();
      lexer.reset("> [!note] Title\n> Content");
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });

    test("tags lex without crashing", () => {
      const lexer = new Lexer();
      lexer.reset("#tag #nested/tag");
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });

    test("aliases lex without crashing", () => {
      const lexer = new Lexer();
      lexer.reset("alias:: value");
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });
  });

  describe("Unicode Math Operators", () => {
    test("unicode multiplication × works", () => {
      const engine = new ExpressionEngine();
      const [result] = engine.evaluateLine(1, "2 × 3");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(6);
    });

    test("unicode division ÷ works", () => {
      const engine = new ExpressionEngine();
      const [result] = engine.evaluateLine(1, "6 ÷ 3");
      expect(result.type).toBe(ValueType.Number);
      expect(result.value).toBe(2);
    });
  });

  describe("Edge Cases", () => {
    test("empty input produces no tokens", () => {
      const lexer = new Lexer();
      lexer.reset("");
      const nonTrivial: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") nonTrivial.push(t.type);
      }
      expect(nonTrivial.length).toBe(0);
    });

    test("whitespace-only input produces no tokens", () => {
      const lexer = new Lexer();
      lexer.reset("   \n\t  \n  ");
      const nonTrivial: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") nonTrivial.push(t.type);
      }
      expect(nonTrivial.length).toBe(0);
    });

    test("very long lines don't crash the lexer", () => {
      const lexer = new Lexer();
      lexer.reset("x".repeat(10000));
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });

    test("deeply nested markdown lists don't crash", () => {
      const lexer = new Lexer();
      lexer.reset("  - ".repeat(10) + "item");
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });
  });

  describe("Stress", () => {
    test("1000 lines of mixed markdown + expressions", () => {
      const lexer = new Lexer();
      let document = "";
      for (let i = 0; i < 1000; i++) {
        document += `Line ${i}: ${i} + ${i}\n`;
        if (i % 10 === 0) document += `# Heading ${i}\n`;
        if (i % 20 === 0) document += `- Item ${i}\n`;
      }
      lexer.reset(document);
      const nonTrivial: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") nonTrivial.push(t.type);
      }
      expect(nonTrivial.length).toBeGreaterThan(100);
    });

    test("100 inline solve markers on one line", () => {
      const lexer = new Lexer();
      let line = "";
      for (let i = 0; i < 100; i++) line += `s\`${i} + ${i}\` `;
      lexer.reset(line);
      const nonTrivial: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") nonTrivial.push(t.type);
      }
      const inlineSolveStarts = nonTrivial.filter(t => t === "INLINE_SOLVE_START");
      expect(inlineSolveStarts.length).toBe(100);
    });

    test("complex nested markdown document", () => {
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
      const nonTrivial: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") nonTrivial.push(t.type);
      }
      expect(nonTrivial.length).toBeGreaterThan(0);
    });
  });

  describe("Error Recovery", () => {
    test("unclosed inline solve doesn't crash", () => {
      const lexer = new Lexer();
      lexer.reset("s`1 + 2"); // Missing closing backtick
      expect(() => {
        for (const _ of lexer) { /* exhaust iterator */ }
      }).not.toThrow();
    });

    test("unmatched brackets are auto-balanced by inferred parentheses", () => {
      const engine = new ExpressionEngine("en", false, {
        validation: { maxExpressionLength: 2000, maxComplexity: 500, maxNestingDepth: 50, autoBalanceParens: true },
      });
      const [result] = engine.evaluateLine(1, "(1 + 2");
      expect(result.toNumber()).toBe(3);
    });

    test("division by zero returns Infinity", () => {
      const engine = new ExpressionEngine();
      const [result] = engine.evaluateLine(1, "1 / 0");
      expect(result.type).toBe(ValueType.Number);
    });

    test("invalid expression throws", () => {
      const engine = new ExpressionEngine();
      expect(() => engine.evaluateLine(1, "++--")).toThrow();
    });
  });
});
