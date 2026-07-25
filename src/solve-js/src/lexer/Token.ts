/**
 * Lexer token produced by {@link ExpressionLexer} and consumed by parsers.
 *
 * Each token carries:
 * - `type`: string name (e.g. "NUMBER", "PLUS") for diagnostics and parselet lookup
 * - `typeId`: integer ID for O(1) comparison in parser hot paths
 * - `value`/`text`: the token's semantic value and raw source text
 * - `offset`/`line`/`col`: source position for error messages and highlighting
 */
export interface Token {
	/** String token type (e.g., "NUMBER", "PLUS", "IDENT"). Used by ParseletRegistry string-keyed maps and error messages. */
	type: string;
	/** Integer token type ID for fast comparison in Parser hot path.
	 * Populated by the Lexer via registerTokenType(). Use tokenTypeId(type) to get a type's ID. */
	typeId: number;
	value: string;
	text: string;
	offset: number;
	lineBreaks: number;
	line: number;
	col: number;
}

/**
 * Canonical token type name constants.
 * All token types used by the lexer, parser, and VM are defined here.
 * Custom/plugin token types should be registered via {@link registerTokenType}.
 */
export const TokenTypes = {
  NUMBER: "NUMBER",
  BIGINT: "BIGINT",
  STRING: "STRING",
  IDENT: "IDENT",
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  CARET: "CARET",
  PERCENT: "PERCENT",
  LSHIFT: "LSHIFT",
  RSHIFT: "RSHIFT",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  COMMA: "COMMA",
  DOT: "DOT",
  COLON: "COLON",
  SEMICOLON: "SEMICOLON",
  EQUALS: "EQUALS",
  DOLLAR: "DOLLAR",
  POUND: "POUND",
  EURO: "EURO",
  QUESTION: "QUESTION",
  BANG: "BANG",
  BIT_AND: "BIT_AND",
  BIT_OR: "BIT_OR",
  BIT_NOT: "BIT_NOT",
  KEYWORD: "KEYWORD",
  EOF: "EOF",
  ERROR: "ERROR",
  WS: "WS",
  NEWLINE: "NEWLINE",
  DATETIME_LITERAL: "DATETIME_LITERAL",
  DURATION: "DURATION",
  UNIT: "UNIT",
  ROLL: "ROLL",
  PI: "PI",
  E: "E",
  MOD: "MOD",
  OF: "OF",
  INCREASE_BY: "INCREASE_BY",
  DECREASE_BY: "DECREASE_BY",
  NOW: "NOW",
  TODAY: "TODAY",
  TOMORROW: "TOMORROW",
  YESTERDAY: "YESTERDAY",
  DURATION_DAY: "DURATION_DAY",
  DURATION_WEEK: "DURATION_WEEK",
  DURATION_MONTH: "DURATION_MONTH",
  DURATION_YEAR: "DURATION_YEAR",
  DURATION_HOUR: "DURATION_HOUR",
  DURATION_MINUTE: "DURATION_MINUTE",
  DURATION_SECOND: "DURATION_SECOND",
  FUNC: "FUNC",
  CONVERT: "CONVERT",
  TO: "TO",
  BEST: "BEST",
  NEXT: "NEXT",
  LAST: "LAST",
  UNTIL: "UNTIL",
  SINCE: "SINCE",
  BETWEEN: "BETWEEN",
  FROM: "FROM",
  INCREASE: "INCREASE",
  DECREASE: "DECREASE",
  UNICODE_MATH: "UNICODE_MATH",
  TIMES_BY: "TIMES_BY",
  MULTIPLY_BY: "MULTIPLY_BY",
  DIVIDE_BY: "DIVIDE_BY",
  NEQ: "NEQ",
  IN: "IN",
  BIT_XOR: "BIT_XOR",
  EQUALITY: "EQUALITY",
  GTE: "GTE",
  LTE: "LTE",
  BACKTICK_OPEN: "BACKTICK_OPEN",
  INLINE_SOLVE_START: "INLINE_SOLVE_START",
  // Vector types (referenced in locale keywordMap as vec2→VEC2, etc.)
  VEC2: "VEC2",
  VEC3: "VEC3",
  VEC4: "VEC4",
  FLOAT: "FLOAT",
  GLOBAL: "GLOBAL",
} as const;

export type TokenType = (typeof TokenTypes)[keyof typeof TokenTypes];

// ── Integer Token Type ID System ──────────────────────────────────────────────
// Enables O(1) integer comparison in Parser hot path instead of string hashing.

/** Auto-incrementing integer ID for each token type. */
let _nextTokenTypeId = 0;

/** String → integer ID lookup. Populated lazily via registerTokenType(). */
const _tokenTypeNameToId = new Map<string, number>();

/** Integer ID → string lookup. For debug/error messages. */
const _tokenTypeIdToName = new Map<number, string>();

/**
 * Register a token type name and get back its integer ID.
 * Idempotent — returns existing ID if already registered.
 * Call once per token type at module initialization time.
 */
export function registerTokenType(name: string): number {
	const existing = _tokenTypeNameToId.get(name);
	if (existing !== undefined) return existing;
	const id = _nextTokenTypeId++;
	_tokenTypeNameToId.set(name, id);
	_tokenTypeIdToName.set(id, name);
	return id;
}

/**
 * Get the integer ID for a token type name.
 * Lazily registers unknown token types on first access — enabling plugin providers
 * to define custom token types (VEC2, VEC3, etc.) without pre-registration.
 * All built-in TokenTypes are pre-registered via registerAllTokenTypes().
 */
export function tokenTypeId(name: string): number {
	return registerTokenType(name);  // registerTokenType is idempotent
}

/**
 * Get the string name for a token type ID (for error messages and debugging).
 * Returns `UNKNOWN_${id}` if the ID is not registered.
 */
export function tokenTypeName(id: number): string {
	return _tokenTypeIdToName.get(id) ?? `UNKNOWN_${id}`;
}

/**
 * Bootstrap all known token types from TokenTypes at module load.
 * Call this once after TokenTypes is defined.
 */
export function registerAllTokenTypes(): void {
	for (const name of Object.values(TokenTypes)) {
		registerTokenType(name);
	}
}
