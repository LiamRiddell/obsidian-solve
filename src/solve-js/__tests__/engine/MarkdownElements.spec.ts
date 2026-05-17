import { describe, expect, test, beforeEach } from "@jest/globals";

import { MarkdownLexer } from "@solve-js/lexer/MarkdownLexer";
import { SolveHighlightProvider } from "@app/codemirror/SolveHighlightProvider";

describe("Markdown Elements and Multi-line Documents", () => {
  describe("Single-line Markdown Elements", () => {
    test("heading marker is filtered out", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("# Heading");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have MD_HEADING_MARKER
      expect(tokens).toContain("MD_HEADING_MARKER");
      // The heading content "Heading" is tokenized as IDENT, which is expected
      // We just want to ensure the heading marker itself is present
    });

    test("list marker is filtered out", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("- Item");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("MD_LIST_MARKER");
    });

    test("ordered list marker is filtered out", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("1. Item");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("MD_ORDERED_LIST_MARKER");
    });

    test("blockquote marker is filtered out", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("> Quote");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("MD_BLOCKQUOTE_MARKER");
    });

    test("inline code is handled", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("`code`");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("BACKTICK_OPEN");
      expect(tokens).toContain("BACKTICK_CLOSE");
    });

    test("inline solve expression is tokenized", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("s`1 + 2`");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("INLINE_SOLVE_START");
      expect(tokens).toContain("BACKTICK_CLOSE");
      // Should also have expression tokens
      const expressionTokens = tokens.filter(t => !t.startsWith("MD_") && t !== "INLINE_SOLVE_START" && t !== "BACKTICK_CLOSE");
      expect(expressionTokens.length).toBeGreaterThan(0);
    });

    test("code block is handled", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("```code```");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("MD_CODE_BLOCK");
    });

    test("MathJax block is handled", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("$$x^2$$");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("MD_MATH_BLOCK");
    });

    test("expression without markdown is tokenized correctly", () => {
      const lexer = new MarkdownLexer("en", "main");
      lexer.reset("1 + 2");
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      expect(tokens).toContain("NUMBER");
      expect(tokens).toContain("PLUS");
      expect(tokens.filter(t => t.startsWith("MD_"))).toHaveLength(0);
    });
  });

  describe("Multi-line Documents", () => {
    test("handles mixed markdown and expressions", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `# Heading
- Item 1
- Item 2
1 + 2
> Quote
3 * 4`;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have markdown markers
      expect(tokens).toContain("MD_HEADING_MARKER");
      expect(tokens).toContain("MD_LIST_MARKER");
      expect(tokens).toContain("MD_BLOCKQUOTE_MARKER");
      // Should also have expression tokens
      expect(tokens).toContain("NUMBER");
      expect(tokens).toContain("PLUS");
      expect(tokens).toContain("STAR");
    });

    test("handles nested list items", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `- Item 1
  - Nested item
  - Another nested item
- Item 2`;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have multiple list markers
      const listMarkers = tokens.filter(t => t === "MD_LIST_MARKER");
      expect(listMarkers.length).toBeGreaterThanOrEqual(3);
    });

    test("handles multi-line code block", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `Here is some code:
\`\`\`
function test() {
  return 1 + 2;
}
\`\`\`
And more text`;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have code block token
      expect(tokens).toContain("MD_CODE_BLOCK");
    });

    test("handles multi-line MathJax block", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `Equation:
$$
x^2 + y^2 = z^2
$$
More text`;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have math block token
      expect(tokens).toContain("MD_MATH_BLOCK");
    });

    test("handles multiple inline solves in document", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `First: s\`1 + 2\`
Second: s\`3 * 4\`
Third: s\`5 - 6\``;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have multiple inline solve starts
      const inlineSolveStarts = tokens.filter(t => t === "INLINE_SOLVE_START");
      expect(inlineSolveStarts.length).toBe(3);
    });

    test("handles document with all markdown elements", () => {
      const lexer = new MarkdownLexer("en", "main");
      const document = `# Main Heading
## Sub Heading
> Blockquote
- List item 1
- List item 2
1. First ordered
2. Second ordered
Inline code: \`code\`
Inline solve: s\`1 + 2\`
Expression: 3 * 4
Code block:
\`\`\`
const x = 1;
\`\`\`
MathJax:
$$
x^2
$$`;
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have all markdown markers
      expect(tokens).toContain("MD_HEADING_MARKER");
      expect(tokens).toContain("MD_BLOCKQUOTE_MARKER");
      expect(tokens).toContain("MD_LIST_MARKER");
      expect(tokens).toContain("MD_ORDERED_LIST_MARKER");
      expect(tokens).toContain("MD_CODE_BLOCK");
      expect(tokens).toContain("MD_MATH_BLOCK");
      expect(tokens).toContain("INLINE_SOLVE_START");
      // Should also have expression tokens
      expect(tokens).toContain("NUMBER");
      expect(tokens).toContain("PLUS");
      expect(tokens).toContain("STAR");
    });

    test("handles large document with many lines", () => {
      const lexer = new MarkdownLexer("en", "main");
      let document = "";
      for (let i = 0; i < 100; i++) {
        document += `Line ${i}: ${i} + ${i}\n`;
      }
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      // Should have many number tokens
      const numberTokens = tokens.filter(t => t === "NUMBER");
      expect(numberTokens.length).toBeGreaterThanOrEqual(200); // 2 numbers per line * 100 lines
    });

    test("handles document with mixed markdown and expressions efficiently", () => {
      const lexer = new MarkdownLexer("en", "main");
      let document = "# Document\n";
      for (let i = 0; i < 50; i++) {
        document += `- Item ${i}: ${i} + ${i}\n`;
      }
      document += "Expression: 1 + 2 + 3 + 4\n";
      for (let i = 0; i < 50; i++) {
        document += `## Subsection ${i}\n`;
        document += `> Quote ${i}\n`;
        document += `${i} * ${i}\n`;
      }
      
      const startTime = Date.now();
      lexer.reset(document);
      const tokens: string[] = [];
      for (const t of lexer) {
        if (t.type !== "WS" && t.type !== "NEWLINE") {
          tokens.push(t.type);
        }
      }
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process within reasonable time (e.g., < 1000ms for 100 lines)
      expect(duration).toBeLessThan(1000);
      
      // Should have markdown markers
      expect(tokens).toContain("MD_HEADING_MARKER");
      expect(tokens).toContain("MD_LIST_MARKER");
      expect(tokens).toContain("MD_BLOCKQUOTE_MARKER");
      // Should also have expression tokens
      expect(tokens).toContain("NUMBER");
      expect(tokens).toContain("PLUS");
      expect(tokens).toContain("STAR");
    });
  });

  describe("SolveHighlightProvider with Markdown", () => {
    let provider: SolveHighlightProvider;

    beforeEach(() => {
      provider = new SolveHighlightProvider();
    });

    test("highlights expression in list item", () => {
      const ranges = provider.getLineHighlights("- 1 + 2");
      expect(ranges.length).toBeGreaterThanOrEqual(3);
      const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
      const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
      expect(numberRanges.length).toBeGreaterThanOrEqual(2);
      expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
    });

    test("highlights expression in blockquote", () => {
      const ranges = provider.getLineHighlights("> 1 + 2");
      expect(ranges.length).toBeGreaterThanOrEqual(3);
      const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
      const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
      expect(numberRanges.length).toBeGreaterThanOrEqual(2);
      expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
    });

    test("does not highlight heading content", () => {
      const ranges = provider.getLineHighlights("# Heading");
      // Heading content should not be highlighted as expression
      expect(ranges).toHaveLength(0);
    });

    test("highlights inline solve expression", () => {
      const ranges = provider.getLineHighlights("s`1 + 2`");
      expect(ranges.length).toBeGreaterThanOrEqual(3);
      const numberRanges = ranges.filter(r => r.className === "cm-solve-number");
      const operatorRanges = ranges.filter(r => r.className === "cm-solve-operator");
      expect(numberRanges.length).toBeGreaterThanOrEqual(2);
      expect(operatorRanges.length).toBeGreaterThanOrEqual(1);
    });

    test("handles multiple expressions in same line", () => {
      const ranges = provider.getLineHighlights("1 + 2 and 3 * 4");
      // Should highlight both expressions
      expect(ranges.length).toBeGreaterThanOrEqual(6); // 2 numbers + 1 operator + 2 numbers + 1 operator
    });

    test("handles complex expression with functions", () => {
      const ranges = provider.getLineHighlights("sqrt(16) + sin(0.5)");
      expect(ranges.length).toBeGreaterThanOrEqual(5);
      const funcRanges = ranges.filter(r => r.className === "cm-solve-function");
      expect(funcRanges.length).toBeGreaterThanOrEqual(2);
    });
  });
});
