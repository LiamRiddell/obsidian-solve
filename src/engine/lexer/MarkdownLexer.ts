import moo from "moo";
import { knownUnits } from "@/engine/lexer/units";
import { Token } from "@/engine/lexer/Token";

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

const keywordMap: Record<string, string> = {
  pi: "PI", e: "E",
  plus: "PLUS", add: "PLUS", and: "PLUS",
  minus: "MINUS", subtract: "MINUS", remove: "MINUS", take: "MINUS",
  times: "STAR", multiply: "STAR",
  divide: "SLASH",
  modulo: "MOD", mod: "MOD",
  exponent: "CARET", prime: "CARET",
  of: "OF",
  now: "NOW", today: "TODAY", tomorrow: "TOMORROW", yesterday: "YESTERDAY",
  days: "DURATION_DAY", day: "DURATION_DAY",
  weeks: "DURATION_WEEK", week: "DURATION_WEEK",
  months: "DURATION_MONTH", month: "DURATION_MONTH",
  years: "DURATION_YEAR", year: "DURATION_YEAR",
  hours: "DURATION_HOUR", hour: "DURATION_HOUR",
  minutes: "DURATION_MINUTE", minute: "DURATION_MINUTE",
  seconds: "DURATION_SECOND", second: "DURATION_SECOND",
  roll: "ROLL",
  sqrt: "FUNC", abs: "FUNC", sin: "FUNC", cos: "FUNC", tan: "FUNC",
  log: "FUNC", ceil: "FUNC", floor: "FUNC", round: "FUNC", min: "FUNC", max: "FUNC",
  asin: "FUNC", acos: "FUNC", atan: "FUNC", atan2: "FUNC",
  sinh: "FUNC", cosh: "FUNC", tanh: "FUNC",
  asinh: "FUNC", acosh: "FUNC", atanh: "FUNC",
  cbrt: "FUNC", clz32: "FUNC", expm1: "FUNC", exp: "FUNC",
  fround: "FUNC", hypot: "FUNC", imul: "FUNC",
  log10: "FUNC", log1p: "FUNC", log2: "FUNC",
  pow: "FUNC", random: "FUNC", sign: "FUNC", trunc: "FUNC",
  degtorad: "FUNC", radtodeg: "FUNC",
  convert: "CONVERT", to: "TO", best: "BEST",
  next: "NEXT", last: "LAST", until: "UNTIL", since: "SINCE",
  between: "BETWEEN", from: "FROM",
  increase: "INCREASE", decrease: "DECREASE",
  vec2: "VEC2", vec3: "VEC3", vec4: "VEC4",
};

export const expressionRules: moo.Rules = {
  WS: { match: /[ \t]+/, lineBreaks: false },
  NEWLINE: { match: /\n+/, lineBreaks: true },
  NUMBER: /(?:0[xX][0-9a-fA-F]+(?:h\b)?|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
  BIGINT: /\d+n/,
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

export class MarkdownLexer {
  private mooLexer: moo.Lexer;

  constructor(initialState = "main") {
    this.mooLexer = moo.states({
      main: {
        ...expressionRules,
      },
      expression: {
        ...expressionRules,
      },
      inline: {
        ...inlineRules,
      },
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
