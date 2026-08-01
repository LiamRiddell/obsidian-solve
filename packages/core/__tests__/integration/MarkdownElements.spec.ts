import { describe, expect, test, beforeEach } from "@jest/globals";

import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";
import { Lexer } from "@solve-js/lexer/Lexer";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { LanguageService } from "@solve-js/language/LanguageService";

describe("Markdown Elements and Multi-line Documents", () => {
  describe("Single-line Markdown Elements", () => {
    test("heading marker is filtered out", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("# Heading");
      expect(classification.type).toBe("heading");
      expect(classification.skip).toBe(true);
    });

    test("list marker is not skipped (evaluated)", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("- Item");
      expect(classification.type).toBe("list");
      expect(classification.skip).toBe(false);
    });

    test("ordered list marker is not skipped (evaluated)", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("1. Item");
      expect(classification.type).toBe("list");
      expect(classification.skip).toBe(false);
    });

    test("blockquote marker is filtered out", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("> Quote");
      expect(classification.type).toBe("blockquote");
      expect(classification.skip).toBe(true);
    });

    test("inline code with backticks is tokenized", () => {
      const exprLexer = new ExpressionLexer("en");
      exprLexer.reset("`code`");
      const tokens = exprLexer.tokenizeAll();
      const types = tokens.map(t => t.type);
      expect(types).toContain("BACKTICK_OPEN");
      // After backtick, the content "code" is tokenized as IDENT
      expect(types).toContain("IDENT");
    });

    test("inline solve expression is tokenized", () => {
      const exprLexer = new ExpressionLexer("en");
      exprLexer.reset("s`1 + 2`");
      const tokens = exprLexer.tokenizeAll();
      const types = tokens.map(t => t.type);
      expect(types).toContain("INLINE_SOLVE_START");
      expect(types).toContain("PLUS");
      expect(types.filter(t => t === "NUMBER").length).toBeGreaterThanOrEqual(2);
    });

    test("code fence is classified correctly", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("```code```");
      expect(classification.type).toBe("code_fence");
      expect(classification.skip).toBe(true);
    });

    test("MathJax fence is classified correctly", () => {
      const lexer = new Lexer("en");
      const classification = lexer.classifyLine("$$x^2$$");
      expect(classification.type).toBe("math_fence");
      expect(classification.skip).toBe(true);
    });

    test("expression without markdown is tokenized correctly", () => {
      const exprLexer = new ExpressionLexer("en");
      exprLexer.reset("1 + 2");
      const tokens = exprLexer.tokenizeAll();
      const types = tokens.map(t => t.type);
      expect(types).toContain("NUMBER");
      expect(types).toContain("PLUS");
    });
  });

  describe("Multi-line Documents", () => {
    test("handles mixed markdown and expressions via line classification", () => {
      const lexer = new Lexer("en");
      const lines = ["# Heading", "- Item 1", "- Item 2", "1 + 2", "> Quote", "3 * 4"];

      const results = lines.map(l => lexer.classifyLine(l));

      expect(results[0].type).toBe("heading");
      expect(results[0].skip).toBe(true);
      expect(results[1].type).toBe("list");
      expect(results[1].skip).toBe(false);
      expect(results[3].type).toBe("expression");
      expect(results[3].skip).toBe(false);
      expect(results[4].type).toBe("blockquote");
      expect(results[4].skip).toBe(true);
      expect(results[5].type).toBe("expression");
      expect(results[5].skip).toBe(false);
    });

    test("handles nested list items", () => {
      const lexer = new Lexer("en");
      const lines = ["- Item 1", "  - Nested item", "  - Another nested item", "- Item 2"];

      for (const line of lines) {
        const classification = lexer.classifyLine(line);
        expect(classification.type).toBe("list");
        expect(classification.skip).toBe(false);
      }
    });

    test("handles multi-line code block via line classification", () => {
      const lexer = new Lexer("en");
      const lines = [
        "Here is some code:",
        "```",
        "function test() {",
        "  return 1 + 2;",
        "}",
        "```",
        "And more text",
      ];

      const results = lines.map(l => lexer.classifyLine(l));
      expect(results[1].type).toBe("code_fence");
      expect(results[1].skip).toBe(true);
      expect(results[5].type).toBe("code_fence");
      expect(results[5].skip).toBe(true);
      // Expression lines between fences still classify as expression
      // (the caller manages fence state to skip lines inside fences)
    });

    test("handles multi-line MathJax block via line classification", () => {
      const lexer = new Lexer("en");
      const lines = ["Equation:", "$$", "x^2 + y^2 = z^2", "$$", "More text"];

      const results = lines.map(l => lexer.classifyLine(l));
      expect(results[1].type).toBe("math_fence");
      expect(results[1].skip).toBe(true);
      expect(results[3].type).toBe("math_fence");
      expect(results[3].skip).toBe(true);
    });

    test("handles multiple inline solves in document", () => {
      const lexer = new Lexer("en");
      const lines = ["First: s`1 + 2`", "Second: s`3 * 4`", "Third: s`5 - 6`"];

      for (const line of lines) {
        const spans = lexer.findInlineSolves(line);
        expect(spans.length).toBe(1);
        expect(spans[0].expression).toBeTruthy();
      }
    });

    test("handles document with all markdown elements via line classification", () => {
      const lexer = new Lexer("en");
      const lines = [
        "# Main Heading",
        "## Sub Heading",
        "> Blockquote",
        "- List item 1",
        "- List item 2",
        "1. First ordered",
        "2. Second ordered",
        "Inline code: `code`",
        "Inline solve: s`1 + 2`",
        "Expression: 3 * 4",
        "```",
        "const x = 1;",
        "```",
        "$$",
        "x^2",
        "$$",
      ];

      const results = lines.map(l => lexer.classifyLine(l));
      expect(results[0].type).toBe("heading");
      expect(results[2].type).toBe("blockquote");
      expect(results[3].type).toBe("list");
      expect(results[5].type).toBe("list");
      expect(results[9].type).toBe("expression");
      expect(results[10].type).toBe("code_fence");
      expect(results[13].type).toBe("math_fence");
    });

    test("handles large document with many lines efficiently", () => {
      const lexer = new Lexer("en");
      const exprLexer = new ExpressionLexer("en");
      let totalNumberTokens = 0;

      for (let i = 0; i < 100; i++) {
        const line = `Line ${i}: ${i} + ${i}`;
        const classification = lexer.classifyLine(line);
        if (!classification.skip) {
          exprLexer.reset(line);
          const tokens = exprLexer.tokenizeAll();
          totalNumberTokens += tokens.filter(t => t.type === "NUMBER").length;
        }
      }
      // 2 numbers per line * 100 lines = 200
      expect(totalNumberTokens).toBeGreaterThanOrEqual(200);
    });

    test("handles document with mixed markdown and expressions efficiently", () => {
      const lexer = new Lexer("en");

      const lines: string[] = ["# Document"];
      for (let i = 0; i < 50; i++) {
        lines.push(`- Item ${i}: ${i} + ${i}`);
      }
      lines.push("Expression: 1 + 2 + 3 + 4");
      for (let i = 0; i < 50; i++) {
        lines.push(`## Subsection ${i}`);
        lines.push(`> Quote ${i}`);
        lines.push(`${i} * ${i}`);
      }

      const startTime = Date.now();
      let expressionCount = 0;
      for (const line of lines) {
        const classification = lexer.classifyLine(line);
        if (!classification.skip) expressionCount++;
      }
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should process within reasonable time
      expect(duration).toBeLessThan(100);
      expect(expressionCount).toBeGreaterThan(100);
    });
  });

  describe("LanguageService with Markdown", () => {
    let engine: ExpressionEngine;
    let service: LanguageService;

    beforeEach(() => {
      engine = new ExpressionEngine("en", false);
      service = new LanguageService(engine);
    });

    test("highlights expression in list item", () => {
      const tokens = service.getSemanticTokens("- 1 + 2", 1);
      expect(tokens.length).toBeGreaterThanOrEqual(3);
      const numberTokens = tokens.filter(r => r.category === "number");
      const operatorTokens = tokens.filter(r => r.category === "operator");
      expect(numberTokens.length).toBeGreaterThanOrEqual(2);
      expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
    });

    test("highlights expression inside blockquote (strips > prefix)", () => {
      const tokens = service.getSemanticTokens("> 1 + 2", 1);
      // The lexer now strips the "> " prefix and highlights the expression content.
      expect(tokens.length).toBeGreaterThanOrEqual(3);
      const numberTokens = tokens.filter(r => r.category === "number");
      const operatorTokens = tokens.filter(r => r.category === "operator");
      expect(numberTokens.length).toBeGreaterThanOrEqual(2);
      expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
    });

    test("does not highlight heading content", () => {
      const tokens = service.getSemanticTokens("# Heading", 1);
      expect(tokens).toHaveLength(0);
    });

    test("highlights inline solve expression", () => {
      const tokens = service.getSemanticTokens("s`1 + 2`", 1);
      expect(tokens.length).toBeGreaterThanOrEqual(3);
      const numberTokens = tokens.filter(r => r.category === "number");
      const operatorTokens = tokens.filter(r => r.category === "operator");
      expect(numberTokens.length).toBeGreaterThanOrEqual(2);
      expect(operatorTokens.length).toBeGreaterThanOrEqual(1);
    });

    test("handles multiple expressions in same line", () => {
      const tokens = service.getSemanticTokens("1 + 2 and 3 * 4", 1);
      expect(tokens.length).toBeGreaterThanOrEqual(6);
    });

    test("handles complex expression with functions", () => {
      const tokens = service.getSemanticTokens("sqrt(16) + sin(0.5)", 1);
      expect(tokens.length).toBeGreaterThanOrEqual(5);
      const funcTokens = tokens.filter(r => r.category === "function");
      expect(funcTokens.length).toBeGreaterThanOrEqual(2);
    });
  });
});
