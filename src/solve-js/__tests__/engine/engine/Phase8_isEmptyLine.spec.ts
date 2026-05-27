import { describe, expect, test } from "@jest/globals";
import { isEmptyLine } from "@solve-js/engine/ExpressionEngineSafety";

describe("Phase 8: isEmptyLine regression tests", () => {
  describe("Whitespace and empty lines", () => {
    test("empty string is empty", () => {
      expect(isEmptyLine("")).toBe(true);
    });

    test("whitespace-only lines are empty", () => {
      expect(isEmptyLine("   ")).toBe(true);
      expect(isEmptyLine("\t")).toBe(true);
      expect(isEmptyLine("  \t  ")).toBe(true);
    });
  });

  describe("Inline solve guard — lines with s` are never empty", () => {
    test("bare inline solve is not empty", () => {
      expect(isEmptyLine("s`1 + 2`")).toBe(false);
    });

    test("inline solve after markdown marker is not empty", () => {
      expect(isEmptyLine("- s`1 + 2`")).toBe(false);
      // Blockquotes and headings are always skipped — even with inline solves
      expect(isEmptyLine("> s`3 + 4`")).toBe(true);
      expect(isEmptyLine("# s`5 + 6`")).toBe(true);
    });

    test("inline solve mid-sentence is not empty", () => {
      expect(isEmptyLine("Result: s`1 + 2` units")).toBe(false);
    });
  });

  describe("Markdown heading markers", () => {
    test("bare heading marker with whitespace is empty", () => {
      expect(isEmptyLine("# ")).toBe(true);
      expect(isEmptyLine("## ")).toBe(true);
      expect(isEmptyLine("### ")).toBe(true);
      expect(isEmptyLine("###### ")).toBe(true);
    });

    test("heading with content is always skipped", () => {
      expect(isEmptyLine("# Heading")).toBe(true);
      expect(isEmptyLine("## Subheading")).toBe(true);
      expect(isEmptyLine("# 1 + 2")).toBe(true);
    });

    test("bare heading without trailing space is empty", () => {
      expect(isEmptyLine("#")).toBe(true);
      expect(isEmptyLine("##")).toBe(true);
      expect(isEmptyLine("###")).toBe(true);
    });
  });

  describe("List markers", () => {
    test("bare unordered list markers are evaluated", () => {
      expect(isEmptyLine("- ")).toBe(false);
      expect(isEmptyLine("* ")).toBe(false);
      expect(isEmptyLine("+ ")).toBe(false);
    });

    test("bare unordered list without trailing space is evaluated", () => {
      expect(isEmptyLine("-")).toBe(false);
      expect(isEmptyLine("*")).toBe(false);
      expect(isEmptyLine("+")).toBe(false);
    });

    test("list items with content are not empty", () => {
      expect(isEmptyLine("- Item")).toBe(false);
      expect(isEmptyLine("* Item")).toBe(false);
      expect(isEmptyLine("+ Item")).toBe(false);
    });

    test("bare ordered list markers are evaluated", () => {
      expect(isEmptyLine("1. ")).toBe(false);
      expect(isEmptyLine("42. ")).toBe(false);
      expect(isEmptyLine("999. ")).toBe(false);
    });

    test("ordered list items with content are not empty", () => {
      expect(isEmptyLine("1. Item")).toBe(false);
      expect(isEmptyLine("2. Something")).toBe(false);
    });
  });

  describe("Blockquote markers", () => {
    test("bare blockquote marker is empty", () => {
      expect(isEmptyLine("> ")).toBe(true);
      expect(isEmptyLine(">")).toBe(true);
    });

    test("blockquote with content is always skipped", () => {
      expect(isEmptyLine("> Quote")).toBe(true);
      expect(isEmptyLine("> 1 + 2")).toBe(true);
    });

    test("Obsidian callouts are always skipped", () => {
      expect(isEmptyLine("> [!note]")).toBe(true);
      expect(isEmptyLine("> [!warning] Careful")).toBe(true);
    });
  });

  describe("Code block fences", () => {
    test("code block fence is empty", () => {
      expect(isEmptyLine("```")).toBe(true);
      expect(isEmptyLine("```javascript")).toBe(true);
      expect(isEmptyLine("```typescript")).toBe(true);
    });

    test("lines with inline backticks but not fences are not empty", () => {
      expect(isEmptyLine("`code`")).toBe(false);
      expect(isEmptyLine("Use `code` here")).toBe(false);
    });
  });

  describe("MathJax fences", () => {
    test("MathJax block fence is empty", () => {
      expect(isEmptyLine("$$")).toBe(true);
      expect(isEmptyLine("$$x^2$$")).toBe(true);
    });

    test("MathJax block with inline content is still empty (structural fence)", () => {
      // MathJax fence with content like $$x^2$$ — the regex checks for leading $$
      expect(isEmptyLine("$$x^2 + y^2$$")).toBe(true);
    });
  });

  describe("Table separator rows", () => {
    test("table separator rows are empty", () => {
      expect(isEmptyLine("|---|")).toBe(true);
      expect(isEmptyLine("| --- |")).toBe(true);
      expect(isEmptyLine("| :--- |")).toBe(true);
      expect(isEmptyLine("| :---: |")).toBe(true);
      expect(isEmptyLine("| ---: |")).toBe(true);
    });

    test("table data rows are not empty", () => {
      expect(isEmptyLine("| Cell 1 | Cell 2 |")).toBe(false);
      expect(isEmptyLine("| 42 | 99 |")).toBe(false);
    });
  });

  describe("Horizontal rules", () => {
    test("three dashes is empty", () => {
      expect(isEmptyLine("---")).toBe(true);
    });

    test("three asterisks is empty", () => {
      expect(isEmptyLine("***")).toBe(true);
    });

    test("three underscores is empty", () => {
      expect(isEmptyLine("___")).toBe(true);
    });

    test("more than three is still empty", () => {
      expect(isEmptyLine("------")).toBe(true);
      expect(isEmptyLine("******")).toBe(true);
      expect(isEmptyLine("______")).toBe(true);
    });

    test("mixed characters are not horizontal rules (not empty)", () => {
      // *-* is not a standard HR pattern
      expect(isEmptyLine("*-*")).toBe(false);
    });
  });

  describe("Wikilinks and embeds", () => {
    test("standalone wikilink is empty", () => {
      expect(isEmptyLine("[[Page Name]]")).toBe(true);
    });

    test("standalone embed is empty", () => {
      expect(isEmptyLine("![[image.png]]")).toBe(true);
    });

    test("wikilink with surrounding text is not empty", () => {
      expect(isEmptyLine("See [[Page Name]] for details")).toBe(false);
    });

    test("embed with surrounding text is not empty", () => {
      expect(isEmptyLine("Here is ![[image.png]] inline")).toBe(false);
    });
  });

  describe("Backward compatibility — existing behavior preserved", () => {
    test("markdown-only lines from LineTracking spec still work", () => {
      expect(isEmptyLine("# ")).toBe(true);
      // Lists are always evaluated, even bare markers
      expect(isEmptyLine("- ")).toBe(false);
      expect(isEmptyLine("> ")).toBe(true);
    });

    test("content lines with markdown prefix — lists evaluate, headings/blockquotes skip", () => {
      expect(isEmptyLine("# Heading text")).toBe(true);
      expect(isEmptyLine("- List item with s`5+6`")).toBe(false);
      expect(isEmptyLine("> Quote with s`7+8`")).toBe(true);
      expect(isEmptyLine("> [!note] Title")).toBe(true);
    });

    test("expression lines are not empty", () => {
      expect(isEmptyLine("1 + 2")).toBe(false);
      expect(isEmptyLine(":x = 5")).toBe(false);
      expect(isEmptyLine("sqrt(16)")).toBe(false);
    });
  });
});
