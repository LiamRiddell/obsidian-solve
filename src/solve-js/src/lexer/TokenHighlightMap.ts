const TOKEN_HIGHLIGHT_MAP: Record<string, string> = {
  NUMBER: "cm-solve-number",

  PI: "cm-solve-keyword",
  E: "cm-solve-keyword",
  NOW: "cm-solve-keyword",
  TODAY: "cm-solve-keyword",
  TOMORROW: "cm-solve-keyword",
  YESTERDAY: "cm-solve-keyword",
  ROLL: "cm-solve-keyword",
  OF: "cm-solve-keyword",

  DURATION_DAY: "cm-solve-keyword",
  DURATION_WEEK: "cm-solve-keyword",
  DURATION_MONTH: "cm-solve-keyword",
  DURATION_YEAR: "cm-solve-keyword",
  DURATION_HOUR: "cm-solve-keyword",
  DURATION_MINUTE: "cm-solve-keyword",
  DURATION_SECOND: "cm-solve-keyword",

  PLUS: "cm-solve-operator",
  MINUS: "cm-solve-operator",
  STAR: "cm-solve-operator",
  SLASH: "cm-solve-operator",
  CARET: "cm-solve-operator",
  PERCENT: "cm-solve-operator",
  LSHIFT: "cm-solve-operator",
  RSHIFT: "cm-solve-operator",
  EQUALS: "cm-solve-operator",
  DOT: "cm-solve-operator",
  COMMA: "cm-solve-operator",
  INCREASE_BY: "cm-solve-operator",
  DECREASE_BY: "cm-solve-operator",

  FUNC: "cm-solve-function",

  DOLLAR: "cm-solve-variable",
  COLON: "cm-solve-variable",

  STRING: "cm-solve-string",

  UNIT: "cm-solve-unit",

  ERROR: "cm-solve-error",
};

/**
 * Map a token type string to its corresponding Codemirror highlight CSS class.
 * Used by the SolveHighlightProvider to style individual tokens in the editor.
 *
 * @param tokenType - The token type string produced by the lexer (e.g., "NUMBER", "FUNC")
 * @returns The CSS class name (e.g., "cm-solve-number"), or undefined if no highlight class exists.
 */
export function getTokenHighlightClass(tokenType: string): string | undefined {
  return TOKEN_HIGHLIGHT_MAP[tokenType];
}
