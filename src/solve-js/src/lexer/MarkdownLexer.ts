import moo from "moo";
import { knownUnits } from "@solve-js/lexer/units";
import { Token } from "@solve-js/lexer/Token";
import { getLocale, type ILocale } from "@solve-js/constants/locales";

function ciKeywords(map: Record<string, string>): (text: string) => string {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lowered[k.toLowerCase()] = v;
  return (text: string) => {
    const lower = text.toLowerCase();
    if (lowered[lower]) return lowered[lower];
    if (knownUnits.has(lower)) return "UNIT";
    return "IDENT";
  };
}

function phraseType(map: Record<string, string>): (text: string) => string {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lowered[k.toLowerCase()] = v;
  return (text: string) => lowered[text.toLowerCase()] || "IDENT";
}

function buildKeywordMap(locale: ILocale): Record<string, string> {
  return { ...locale.keywordMap };
}

export class MarkdownLexer {
  private mooLexer: moo.Lexer;
  private localeCode: string;

  /**
   * @param localeCode - The locale code for internationalization (default: "en").
   * @param initialState - The initial moo state to start lexing in (default: "main").
   *                       States: "main" (full document), "expression" (raw expressions),
   *                       "heading", "blockquote", "list_item", "inline", "inline_solve".
   */
  constructor(localeCode = "en", initialState = "main") {
    this.localeCode = localeCode;
    const locale = getLocale(localeCode);
    const keywordMap = buildKeywordMap(locale);

    const expressionRules: moo.Rules = {
      WS: { match: /[ \t]+/, lineBreaks: false },
      NEWLINE: { match: /\n+/, lineBreaks: true },
      BIGINT: /\d+n/,
      NUMBER: /(?:0[xX][0-9a-fA-F]+(?:h\b)?|0[bB][01]+|\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d+)?(?:[eE][+-]?\d+)?/,
      PLUS: "+", MINUS: "-", STAR: "*", SLASH: "/", CARET: "^", PERCENT: "%",
      LSHIFT: "<<", RSHIFT: ">>", BIT_AND: "&", BIT_OR: "|", BIT_NOT: "~", BANG: "!",
      LPAREN: "(", RPAREN: ")", LBRACKET: "[", RBRACKET: "]",
      LBRACE: "{", RBRACE: "}",
      COMMA: ",", DOT: ".", COLON: ":", SEMICOLON: ";", EQUALS: "=", DOLLAR: "$", POUND: "£", EURO: "€",
      QUESTION: "?",
      TO_THE_POWER_OF: { match: /\b[Tt][Oo] [Tt][Hh][Ee] [Pp][Oo][Ww][Ee][Rr] [Oo][Ff]\b/, type: phraseType({ "to the power of": "CARET" }) },
      POWER_OF: { match: /\b[Pp][Oo][Ww][Ee][Rr] [Oo][Ff]\b/, type: phraseType({ "power of": "CARET" }) },
      TIMES_BY: { match: /\b[Tt][Ii][Mm][Ee][Ss] [Bb][Yy]\b/, type: phraseType({ "times by": "TIMES_BY" }) },
      MULTIPLY_BY: { match: /\b[Mm][Uu][Ll][Tt][Ii][Pp][Ll][Yy] [Bb][Yy]\b/, type: phraseType({ "multiply by": "MULTIPLY_BY" }) },
      DIVIDE_BY: { match: /\b[Dd][Ii][Vv][Ii][Dd][Ee] [Bb][Yy]\b/, type: phraseType({ "divide by": "DIVIDE_BY" }) },
      INCREASE_BY: { match: /\b[Ii][Nn][Cc][Rr][Ee][Aa][Ss][Ee] [Bb][Yy]\b/, type: phraseType({ "increase by": "INCREASE_BY" }) },
      DECREASE_BY: { match: /\b[Dd][Ee][Cc][Rr][Ee][Aa][Ss][Ee] [Bb][Yy]\b/, type: phraseType({ "decrease by": "DECREASE_BY" }) },
      IDENT: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: ciKeywords(keywordMap) },
      STRING: /"(?:[^"\\]|\\.)*"/,
      COMMENT: { match: /(?:#[^\n]*|\/\/[^\n]*)/, lineBreaks: true },
      BACKTICK_OPEN: { match: "`", push: "inline" },
      UNICODE_MATH: { match: /[\u00D7\u00F7\u2260]/, type: (text: string) => {
        if (text === "\u00D7") return "STAR";
        if (text === "\u00F7") return "SLASH";
        return "NEQ";
      } },
      ERROR: moo.error,
    };

    const mainRules: moo.Rules = {
      // Markdown markers
      MD_HEADING_MARKER: { match: /^(?:#{1,6})\s/, push: "heading" },
      MD_BLOCKQUOTE_MARKER: { match: /^>\s/, push: "blockquote" },
      MD_LIST_MARKER: { match: /^(?:\s*)[-*]\s/, push: "list_item" },
      MD_ORDERED_LIST_MARKER: { match: /^(?:\s*)\d+\.\s/, push: "list_item" },
      // Code blocks and MathJax blocks (multi-line)
      MD_CODE_BLOCK: { match: /```[\s\S]*?```/, lineBreaks: true },
      MD_MATH_BLOCK: { match: /\$\$[\s\S]*?\$\$/, lineBreaks: true },
      // Inline code (single line)
      BACKTICK_OPEN: { match: "`", push: "inline" },
      // Inline solve (s`...`)
      INLINE_SOLVE_START: { match: /s`/, push: "inline_solve" },
      // Expression rules (for non-markdown lines)
      ...expressionRules,
    };

    const inlineSolveRules: moo.Rules = {
      BACKTICK_CLOSE: { match: "`", pop: 1 },
      // Tokenize expression content inside inline solve
      ...expressionRules,
      ERROR: moo.error,
    };

    const headingRules: moo.Rules = {
      // Tokenize heading content
      BACKTICK_OPEN: { match: "`", push: "inline" },
      INLINE_SOLVE_START: { match: /s`/, push: "inline_solve" },
      ...expressionRules,
      // When line ends, pop back to main state
      NEWLINE: { match: /\n+/, lineBreaks: true, pop: 1 },
    };

    const blockquoteRules: moo.Rules = {
      // Tokenize blockquote content
      BACKTICK_OPEN: { match: "`", push: "inline" },
      INLINE_SOLVE_START: { match: /s`/, push: "inline_solve" },
      ...expressionRules,
      // When line ends, pop back to main state
      NEWLINE: { match: /\n+/, lineBreaks: true, pop: 1 },
    };

    const listItemRules: moo.Rules = {
      // Tokenize list item content
      BACKTICK_OPEN: { match: "`", push: "inline" },
      INLINE_SOLVE_START: { match: /s`/, push: "inline_solve" },
      ...expressionRules,
      // When line ends, pop back to main state
      NEWLINE: { match: /\n+/, lineBreaks: true, pop: 1 },
    };

    const inlineRules: moo.Rules = {
      BACKTICK_CLOSE: { match: "`", pop: 1 },
      CONTENT: { match: /[^`]+/, lineBreaks: true },
      ERROR: moo.error,
    };

    this.mooLexer = moo.states({
      main: mainRules,
      expression: expressionRules,
      heading: headingRules,
      blockquote: blockquoteRules,
      list_item: listItemRules,
      inline: inlineRules,
      inline_solve: inlineSolveRules,
    }, initialState);
  }

  reset(input: string): void {
    this.mooLexer.reset(input);
  }

  next(): Token | undefined {
    return this.mooLexer.next() as Token | undefined;
  }

  [Symbol.iterator](): Iterator<Token> {
    return this.mooLexer[Symbol.iterator]() as Iterator<Token>;
  }
}

