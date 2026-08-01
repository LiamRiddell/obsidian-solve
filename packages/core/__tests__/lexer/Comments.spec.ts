import { describe, test, expect } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { isEmptyLine } from "@solve-js/engine/ExpressionEngineSafety";
import { TokenTypes } from "@solve-js/lexer/Token";
import { getTokenCategory, UNCATEGORIZED_TOKEN_TYPES } from "@solve-js/language/TokenCategoryMap";

// ═══════════════════════════════════════════════════════════════════════════
// Headings & comments — SoulverCore-style regression coverage.
//
// Research summary (documentation.soulver.app/syntax-reference/headings-and-comments):
//   - HEADINGS: a `#`-prefixed line is emboldened and never shows an answer,
//     even if it contains numbers. This engine already implements that via
//     ExpressionLexer.classifyFromPositions()'s heading branch, which
//     unconditionally marks any line starting with `#` as
//     { type: 'heading', skip: true } — already covered unit-by-unit in
//     ExpressionLexer.classifyLine.spec.ts and engine/IsEmptyLine.spec.ts.
//     What's NEW here is proving it end-to-end through a real
//     ExpressionEngine.parseDocument() call, not just the classifier.
//   - COMMENTS: SoulverCore documents `//` as an inline/trailing marker —
//     "All numbers after two slashes are ignored" — and shows it both as a
//     whole standalone line ("// 1 + 2") and trailing after a still-evaluated
//     expression ("... on clothes // on 10-02-2019" -> $173.00, i.e. the part
//     before `//` still computes normally). SoulverCore also documents label
//     colons, parenthetical asides, and quoted numbers as OTHER ways to
//     exclude numbers from evaluation — those are NOT implemented here and
//     are deliberately out of scope for this pass (see final report).
//
// What THIS codebase already had, before this test file existed:
//   - ExpressionLexer.tokenizeComment() / the `// comment` branch of
//     tokenizeOperator() already emit a single COMMENT token that swallows
//     everything from the marker to end-of-line — for a `#` or `//` marker
//     appearing ANYWHERE in a line, not just at the start.
//   - ExpressionEngine.prepareExpression() / evaluateExpressionWithDiagnostic()
//     already filter COMMENT tokens out of the token stream before the
//     normalizer/parser ever see them (grep for "Filter COMMENT tokens" in
//     ExpressionEngine.ts).
//   - classifyFromPositions() already treats a line whose first non-whitespace
//     characters are `//` as a whole-line comment (skip: true, no tokens
//     produced at all) — mirroring how headings are skipped.
//
// This file's job is regression coverage proving all of the above actually
// composes correctly through the public ExpressionEngine API, since none of
// it had a test at that level before (only classifyLine()-level unit tests
// existed for the whole-line cases).
// ═══════════════════════════════════════════════════════════════════════════

describe("Headings & comments — lexer-level token stream", () => {
  test("`//` mid-expression emits a single COMMENT token to end of line", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("5 + 3 // subtotal");
    const result = lexer.tokenizeAll();
    expect(result.map(t => t.type)).toEqual(["NUMBER", "PLUS", "NUMBER", "COMMENT"]);
    expect(result[3].value).toBe("// subtotal");
  });

  test("`#` mid-expression emits a single COMMENT token to end of line", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("5 + 3 # subtotal");
    const result = lexer.tokenizeAll();
    expect(result.map(t => t.type)).toEqual(["NUMBER", "PLUS", "NUMBER", "COMMENT"]);
    expect(result[3].value).toBe("# subtotal");
  });

  test("bare trailing `//` with no note text still emits a COMMENT token", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("5 + 3 //");
    const result = lexer.tokenizeAll();
    expect(result.map(t => t.type)).toEqual(["NUMBER", "PLUS", "NUMBER", "COMMENT"]);
  });

  test("a single `/` (division) is not mistaken for a comment", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("10 / 2");
    const result = lexer.tokenizeAll();
    expect(result.map(t => t.type)).toEqual(["NUMBER", "SLASH", "NUMBER"]);
  });

  test("division followed by a separate trailing `//` comment keeps the SLASH token", () => {
    const lexer = new ExpressionLexer();
    lexer.reset("10 / 2 // half");
    const result = lexer.tokenizeAll();
    expect(result.map(t => t.type)).toEqual(["NUMBER", "SLASH", "NUMBER", "COMMENT"]);
  });

  test("whole-line `//` comment classifies as skip with zero tokens (scanDocument)", () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument("// this whole line is ignored");
    expect(results[0].classification).toEqual({ type: "comment", skip: true, hasInlineSolve: false });
    expect(results[0].tokens).toEqual([]);
  });

  test("COMMENT is a registered token type (TokenTypes.COMMENT)", () => {
    expect(TokenTypes.COMMENT).toBe("COMMENT");
  });
});

describe("Headings & comments — TokenCategoryMap completeness", () => {
  // COMMENT tokens are filtered out of the evaluation pipeline entirely (see
  // ExpressionEngine.prepareExpression()'s "Filter COMMENT tokens" step), so
  // — like WS/NEWLINE/BACKTICK_OPEN/INLINE_SOLVE_START — they're deliberately
  // excluded from TOKEN_CATEGORY_MAP rather than given a semantic highlight
  // category. This is a regression guard for that decision: if a future
  // change makes COMMENT categorized (or un-allowlists it) without updating
  // this test, that's a deliberate, visible signal to reconsider it.
  test("COMMENT has no semantic category and is explicitly allowlisted", () => {
    expect(getTokenCategory("COMMENT")).toBeUndefined();
    expect(UNCATEGORIZED_TOKEN_TYPES.has("COMMENT")).toBe(true);
  });

  test("every TokenTypes entry — including COMMENT — is categorized or allowlisted", () => {
    const missing: string[] = [];
    for (const tokenType of Object.values(TokenTypes)) {
      if (getTokenCategory(tokenType) === undefined && !UNCATEGORIZED_TOKEN_TYPES.has(tokenType)) {
        missing.push(tokenType);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("Headings & comments — isEmptyLine() (engine safety layer)", () => {
  test("a markdown heading line is always empty, even with a trailing comment", () => {
    expect(isEmptyLine("# Budget")).toBe(true);
    expect(isEmptyLine("# Budget // not a real comment, whole line already skipped")).toBe(true);
  });

  test("a whole-line `//` comment is empty", () => {
    expect(isEmptyLine("// 1 + 2")).toBe(true);
  });

  test("a line with only a trailing inline comment after real content is NOT empty", () => {
    // The comment doesn't make the line "empty" — it's still an expression
    // line; the comment text is stripped later, at tokenization/parse time.
    expect(isEmptyLine("5 + 3 // subtotal")).toBe(false);
  });
});

describe("Headings & comments — end-to-end via a real ExpressionEngine", () => {
  test("a trailing `//` comment does not change the evaluated result", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.evaluateNumber("5 + 3 // subtotal")).toBe(8);
  });

  test("a trailing `#` comment does not change the evaluated result", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.evaluateNumber("5 + 3 # subtotal")).toBe(8);
  });

  test("a bare trailing `//` with no note text still evaluates normally", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.evaluateNumber("5 + 3 //")).toBe(8);
  });

  test("division is unaffected by comment support (single `/` still divides)", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.evaluateNumber("10 / 2")).toBe(5);
    expect(engine.evaluateNumber("10 / 2 // half")).toBe(5);
  });

  test("a whole-line `//` comment produces no result via parseDocument()", () => {
    const engine = new ExpressionEngine("en");
    const doc = engine.parseDocument("// ignored entirely\n5 + 3", { inputType: "markdown" });

    expect(doc.lines).toHaveLength(2);

    const commentLine = doc.lines[0];
    expect(commentLine.isEmpty).toBe(true);
    expect(commentLine.result).toBeNull();
    expect(commentLine.expression).toBeNull();

    const calcLine = doc.lines[1];
    expect(calcLine.isEmpty).toBe(false);
    expect(calcLine.result?.toNumber()).toBe(8);
  });

  test("mixed document: heading + whole-line comment + inline comment + calculation — only the calculation produces a result", () => {
    const engine = new ExpressionEngine("en");
    const document = [
      "# Monthly Budget",
      "// Figures below are estimates, not final",
      "5 + 3 // subtotal for groceries",
    ].join("\n");

    const doc = engine.parseDocument(document, { inputType: "markdown" });

    expect(doc.lines).toHaveLength(3);

    const headingLine = doc.lines[0];
    expect(headingLine.isEmpty).toBe(true);
    expect(headingLine.result).toBeNull();
    expect(headingLine.expression).toBeNull();

    const commentLine = doc.lines[1];
    expect(commentLine.isEmpty).toBe(true);
    expect(commentLine.result).toBeNull();
    expect(commentLine.expression).toBeNull();

    const calcLine = doc.lines[2];
    expect(calcLine.isEmpty).toBe(false);
    expect(calcLine.result).not.toBeNull();
    expect(calcLine.result?.toNumber()).toBe(8);
    expect(calcLine.error).toBeNull();

    // Exactly one of the three lines produced a result.
    const resultCount = doc.lines.filter(l => l.result !== null).length;
    expect(resultCount).toBe(1);
  });

  test("a heading containing an inline solve marker still produces no line-level result", () => {
    const engine = new ExpressionEngine("en");
    const doc = engine.parseDocument("# Total: s`1 + 2`", { inputType: "markdown" });
    expect(doc.lines[0].isEmpty).toBe(true);
    expect(doc.lines[0].result).toBeNull();
  });
});
