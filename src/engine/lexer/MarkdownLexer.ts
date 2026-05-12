import moo from "moo";
import { knownUnits } from "@/engine/lexer/units";
import { Token } from "@/engine/lexer/Token";
import { getLocale, type ILocale } from "@/constants/locales";

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

  constructor(localeCode = "en", initialState = "main") {
    this.localeCode = localeCode;
    const locale = getLocale(localeCode);
    const keywordMap = buildKeywordMap(locale);

    const expressionRules: moo.Rules = {
      WS: { match: /[ \t]+/, lineBreaks: false },
      NEWLINE: { match: /\n+/, lineBreaks: true },
      BIGINT: /\d+n/,
      NUMBER: /(?:0[xX][0-9a-fA-F]+(?:h\b)?|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
      PLUS: "+", MINUS: "-", STAR: "*", SLASH: "/", CARET: "^", PERCENT: "%",
      LSHIFT: "<<", RSHIFT: ">>", BIT_AND: "&", BIT_OR: "|", BIT_NOT: "~", BANG: "!",
      LPAREN: "(", RPAREN: ")", LBRACKET: "[", RBRACKET: "]",
      LBRACE: "{", RBRACE: "}",
      COMMA: ",", DOT: ".", COLON: ":", SEMICOLON: ";", EQUALS: "=", DOLLAR: "$",
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
      UNICODE_MATH: { match: /[×÷≠]/, type: (text: string) => text === "×" ? "STAR" : text === "÷" ? "SLASH" : "NEQ" },
      ERROR: moo.error,
    };

    const inlineRules: moo.Rules = {
      BACKTICK_CLOSE: { match: "`", pop: 1 },
      CONTENT: { match: /[^`]+/, lineBreaks: true },
      ERROR: moo.error,
    };

    this.mooLexer = moo.states({
      main: { ...expressionRules },
      expression: { ...expressionRules },
      inline: { ...inlineRules },
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
