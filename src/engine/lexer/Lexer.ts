import moo from "moo";
import { Token } from "@/engine/lexer/Token";
import { LexerState } from "@/engine/lexer/LexerState";
import { getTokenHighlightClass } from "@/engine/lexer/TokenHighlightMap";

const knownUnits = new Set([
  "mm", "cm", "m", "km", "in", "ft", "yd", "mi",
  "g", "kg", "lb", "oz", "mcg", "mg", "t", "mt",
  "ml", "l", "cl", "dl", "gal", "cup", "pnt", "qt",
  "s", "min", "h", "d", "day", "week", "month", "year",
  "c", "f", "k",
  "hz", "khz", "mhz", "ghz", "thz",
  "w", "kw", "mw", "gw", "wh", "kwh", "mwh", "gwh",
  "v", "kv", "mv", "a", "ka", "ma",
  "pa", "kpa", "mpa", "bar", "psi", "ksi", "torr",
  "usd", "eur", "gbp", "jpy",
  "deg", "rad", "grad",
  "b", "kb", "mb", "gb", "tb", "bit",
]);

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
  pi: "PI",
  e: "E",
  plus: "PLUS",
  add: "PLUS",
  and: "PLUS",
  minus: "MINUS",
  subtract: "MINUS",
  remove: "MINUS",
  take: "MINUS",
  times: "STAR",
  multiply: "STAR",
  divide: "SLASH",
  modulo: "MOD",
  mod: "MOD",
  exponent: "CARET",
  prime: "CARET",
  of: "OF",
  now: "NOW",
  today: "TODAY",
  tomorrow: "TOMORROW",
  yesterday: "YESTERDAY",
days: "DURATION_DAY",
  day: "DURATION_DAY",
  weeks: "DURATION_WEEK",
  week: "DURATION_WEEK",
  months: "DURATION_MONTH",
  month: "DURATION_MONTH",
  years: "DURATION_YEAR",
  year: "DURATION_YEAR",
  hours: "DURATION_HOUR",
  hour: "DURATION_HOUR",
  minutes: "DURATION_MINUTE",
  minute: "DURATION_MINUTE",
  seconds: "DURATION_SECOND",
  second: "DURATION_SECOND",
  roll: "ROLL",
  sqrt: "FUNC",
  abs: "FUNC",
  sin: "FUNC",
  cos: "FUNC",
  tan: "FUNC",
  log: "FUNC",
  ceil: "FUNC",
  floor: "FUNC",
  round: "FUNC",
  min: "FUNC",
  max: "FUNC",
};

export class Lexer {
  private mooLexer: moo.Lexer;
  private currentState: LexerState = LexerState.Main;
  private peekedToken: Token | undefined;
  private hasPeeked = false;

  constructor() {
    this.mooLexer = moo.states({
      main: {
        WS: { match: /[ \t]+/, lineBreaks: false },
        NEWLINE: { match: /\n+/, lineBreaks: true },
        NUMBER: /(?:0[xX][0-9a-fA-F]+(?:h\b)?|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
        PLUS: "+",
        MINUS: "-",
        STAR: "*",
        SLASH: "/",
        CARET: "^",
        PERCENT: "%",
        LSHIFT: "<<",
        RSHIFT: ">>",
        BANG: "!",
        LPAREN: "(",
        RPAREN: ")",
        LBRACKET: "[",
        RBRACKET: "]",
        LBRACE: "{",
        RBRACE: "}",
        COMMA: ",",
        DOT: ".",
        COLON: ":",
        SEMICOLON: ";",
        EQUALS: "=",
        DOLLAR: "$",
        TO_THE_POWER_OF: { match: /\b[Tt][Oo] [Tt][Hh][Ee] [Pp][Oo][Ww][Ee][Rr] [Oo][Ff]\b/, type: phraseType({ "to the power of": "CARET" }) },
        POWER_OF: { match: /\b[Pp][Oo][Ww][Ee][Rr] [Oo][Ff]\b/, type: phraseType({ "power of": "CARET" }) },
        INCREASE_BY: { match: /\b[Ii][Nn][Cc][Rr][Ee][Aa][Ss][Ee] [Bb][Yy]\b/, type: phraseType({ "increase by": "INCREASE_BY" }) },
        DECREASE_BY: { match: /\b[Dd][Ee][Cc][Rr][Ee][Aa][Ss][Ee] [Bb][Yy]\b/, type: phraseType({ "decrease by": "DECREASE_BY" }) },
        IDENT: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: ciKeywords(keywordMap) },
        STRING: /"(?:[^"\\]|\\.)*"/,
        COMMENT: { match: /(?:#[^\n]*|\/\/[^\n]*)/, lineBreaks: true },
        BACKTICK_OPEN: { match: "`", push: "inline" },
        ERROR: moo.error,
      },
      inline: {
        BACKTICK_CLOSE: { match: "`", pop: 1 },
        CONTENT: { match: /[^`]+/, lineBreaks: true },
        ERROR: moo.error,
      },
    });
  }

  reset(input: string, state?: LexerState): void {
    this.currentState = state ?? LexerState.Main;
    this.mooLexer.reset(input);
    this.hasPeeked = false;
    this.peekedToken = undefined;
  }

  next(): Token | undefined {
    if (this.hasPeeked) {
      this.hasPeeked = false;
      return this.peekedToken;
    }
    return this.mooLexer.next() as Token | undefined;
  }

  peek(): Token | undefined {
    if (this.hasPeeked) {
      return this.peekedToken;
    }
    this.peekedToken = this.next();
    this.hasPeeked = true;
    return this.peekedToken;
  }

  [Symbol.iterator](): Iterator<Token> {
    return this.mooLexer[Symbol.iterator]() as Iterator<Token>;
  }

getState(): LexerState {
    return this.currentState;
  }

  setState(state: LexerState): void {
    this.currentState = state;
  }

  getHighlightTokens(lineText: string): {type: string; value: string; offset: number; col: number; length: number; className: string | undefined}[] {
    this.reset(lineText);
    const result: {type: string; value: string; offset: number; col: number; length: number; className: string | undefined}[] = [];
    for (const token of this) {
      if (token.type === "WS" || token.type === "NEWLINE") {
        continue;
      }
      result.push({
        type: token.type,
        value: token.value,
        offset: token.offset,
        col: token.col,
        length: token.value.length,
        className: getTokenHighlightClass(token.type),
      });
    }
return result;
  }
}

export const sharedLexer = new Lexer();