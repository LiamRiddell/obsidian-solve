import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";

// ═══════════════════════════════════════════════════════════════════════════
// classifyLine() — Markdown line classification (Phase B)
// ═══════════════════════════════════════════════════════════════════════════

describe("ExpressionLexer — classifyLine", () => {
  const lexer = new ExpressionLexer();

  function classify(input: string) {
    return lexer.classifyLine(input);
  }

  // ── Empty / whitespace ────────────────────────────────────────────

  test("empty string → empty", () => {
    expect(classify("")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("whitespace-only → empty", () => {
    expect(classify("   ")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("tab-only → empty", () => {
    expect(classify("\t")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  test("leading whitespace then empty → empty", () => {
    expect(classify("  \t  ")).toEqual({ type: "empty", skip: true, hasInlineSolve: false });
  });

  // ── Headings ─────────────────────────────────────────────────────

  test("# heading → heading, always skip", () => {
    expect(classify("# Introduction")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("## heading → heading, always skip", () => {
    expect(classify("## Section")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("### heading → heading, always skip", () => {
    expect(classify("### Subsection")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("###### heading (max 6) → heading, always skip", () => {
    expect(classify("###### Deep")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  test("####### (7 hashes) is not a heading → comment", () => {
    // More than 6 # is not standard Markdown heading
    const c = classify("####### Not a heading");
    expect(c.type).toBe("heading"); // comment treated as heading-type skip
    expect(c.skip).toBe(true);
  });

  test("bare # without space → comment", () => {
    const c = classify("#");
    expect(c.skip).toBe(true);
  });

  test("bare ## → comment", () => {
    const c = classify("##");
    expect(c.skip).toBe(true);
  });

  test("heading with content is skipped", () => {
    expect(classify("# Budget: 100 + 200").skip).toBe(true);
  });

  test("indented heading (leading whitespace)", () => {
    expect(classify("  # Title")).toEqual({
      type: "heading", skip: true, hasInlineSolve: false,
    });
  });

  // ── Blockquotes ──────────────────────────────────────────────────

  test("> blockquote → always skip", () => {
    expect(classify("> quoted text")).toEqual({
      type: "blockquote", skip: true, hasInlineSolve: false,
    });
  });

  test("blockquote with content is skipped", () => {
    expect(classify("> 1 + 2 = 3").skip).toBe(true);
  });

  test("Obsidian callout > [!note] → always skip", () => {
    expect(classify("> [!note]")).toEqual({
      type: "blockquote", skip: true, hasInlineSolve: false,
    });
  });

  test("bare > → always skip", () => {
    const c = classify(">");
    expect(c.skip).toBe(true);
  });

  test("bare > with trailing space → always skip", () => {
    const c = classify("> ");
    expect(c.skip).toBe(true);
    expect(c.type).toBe("blockquote");
  });

  test("> without space is not blockquote → expression", () => {
    // ">no-space" is not valid Markdown blockquote syntax (missing space)
    const c = classify(">no-space");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  // ── Code fences ──────────────────────────────────────────────────

  test("``` → code fence, skip", () => {
    expect(classify("```")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("```javascript → code fence, skip", () => {
    expect(classify("```javascript")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("~~~ → code fence, skip", () => {
    expect(classify("~~~")).toEqual({
      type: "code_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("indented code fence", () => {
    expect(classify("  ```").skip).toBe(true);
  });

  test("single backtick is not a fence", () => {
    const c = classify("`code`");
    expect(c.type).not.toBe("code_fence");
    expect(c.skip).toBe(false);
  });

  // ── Math fences ──────────────────────────────────────────────────

  test("$$ → math fence, skip", () => {
    expect(classify("$$")).toEqual({
      type: "math_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("$$x^2$$ → math fence with inline content, still skip", () => {
    expect(classify("$$x^2$$")).toEqual({
      type: "math_fence", skip: true, hasInlineSolve: false,
    });
  });

  test("single $ is not a math fence", () => {
    const c = classify("$x^2$");
    expect(c.type).not.toBe("math_fence");
  });

  // ── Horizontal rules ─────────────────────────────────────────────

  test("--- → hr, skip", () => {
    expect(classify("---")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("*** → hr, skip", () => {
    expect(classify("***")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("___ → hr, skip", () => {
    expect(classify("___")).toEqual({ type: "hr", skip: true, hasInlineSolve: false });
  });

  test("more than 3 dashes → hr", () => {
    expect(classify("---------").type).toBe("hr");
  });

  test("mixed chars like -*- are not hr", () => {
    expect(classify("-*-").type).not.toBe("hr");
  });

  test("mixed chars like *-* are not hr", () => {
    expect(classify("*-*").type).not.toBe("hr");
  });

  // ── Lists (always evaluate) ───────────────────────────────────────

  test("- item → list, evaluate", () => {
    expect(classify("- item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("* item → list, evaluate", () => {
    expect(classify("* item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("+ item → list, evaluate", () => {
    expect(classify("+ item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("1. item → list, evaluate", () => {
    expect(classify("1. item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("multi-digit ordered list → list, evaluate", () => {
    expect(classify("123. item")).toEqual({
      type: "list", skip: false, hasInlineSolve: false,
    });
  });

  test("bare - (no space) → list, evaluate", () => {
    const c = classify("-");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare * (no space) → list, evaluate", () => {
    const c = classify("*");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare + (no space) → list, evaluate", () => {
    const c = classify("+");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("bare 1. (no content) → list, evaluate", () => {
    const c = classify("1. ");
    expect(c.type).toBe("list");
    expect(c.skip).toBe(false);
  });

  test("indented list", () => {
    expect(classify("  - item").type).toBe("list");
  });

  // ── Tables ────────────────────────────────────────────────────────

  test("|---| → table_separator, skip", () => {
    expect(classify("|---|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("|:---| → table_separator (aligned), skip", () => {
    expect(classify("|:---|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("|---:|---:| → table_separator, skip", () => {
    expect(classify("|---:|---:|")).toEqual({
      type: "table_separator", skip: true, hasInlineSolve: false,
    });
  });

  test("| Cell | → table data row, evaluate", () => {
    const c = classify("| Cell |");
    expect(c.skip).toBe(false);
  });

  test("| 1 + 2 | Data | → table data row, evaluate", () => {
    const c = classify("| 1 + 2 | Data |");
    expect(c.skip).toBe(false);
  });

  // ── Wikilinks / embeds ───────────────────────────────────────────

  test("[[page]] → wikilink, skip", () => {
    expect(classify("[[page]]")).toEqual({
      type: "wikilink", skip: true, hasInlineSolve: false,
    });
  });

  test("![[image.png]] → wikilink (embed), skip", () => {
    expect(classify("![[image.png]]")).toEqual({
      type: "wikilink", skip: true, hasInlineSolve: false,
    });
  });

  test("[[page]] with trailing text is not wikilink → expression", () => {
    const c = classify("[[page]] some text");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  test("[[page]] with trailing expression is not wikilink → expression", () => {
    const c = classify("[[page]] 1 + 2");
    expect(c.type).toBe("expression");
    expect(c.skip).toBe(false);
  });

  test("wikilink with leading whitespace", () => {
    expect(classify("  [[page]]").type).toBe("wikilink");
  });

  // ── Comments ──────────────────────────────────────────────────────

  test("// comment → comment, skip", () => {
    expect(classify("// this is a comment")).toEqual({
      type: "comment", skip: true, hasInlineSolve: false,
    });
  });

  test("bare // → comment, skip", () => {
    expect(classify("//")).toEqual({
      type: "comment", skip: true, hasInlineSolve: false,
    });
  });

  test("indented // comment → comment, skip", () => {
    expect(classify("  // comment").type).toBe("comment");
  });

  // ── Expression lines ──────────────────────────────────────────────

  test("plain text → expression", () => {
    expect(classify("hello")).toEqual({
      type: "expression", skip: false, hasInlineSolve: false,
    });
  });

  test("arithmetic → expression", () => {
    expect(classify("1 + 2 * 3")).toEqual({
      type: "expression", skip: false, hasInlineSolve: false,
    });
  });

  test("expression with inline solve detected", () => {
    expect(classify("s`1 + 2`")).toEqual({
      type: "expression", skip: false, hasInlineSolve: true,
    });
  });

  test("inline solve mid-sentence", () => {
    expect(classify("total is s`100 + 50` dollars")).toEqual({
      type: "expression", skip: false, hasInlineSolve: true,
    });
  });
});
