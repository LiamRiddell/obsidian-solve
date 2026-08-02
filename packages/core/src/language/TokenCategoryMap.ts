import type { TokenCategory } from "@solve-js/language/TokenCategory";

/**
 * Static, built-in token-type → semantic-category table.
 *
 * Covers the full `TokenTypes` surface (see Token.ts) so nothing recognized
 * by the lexer's grammar goes uncategorized by omission. Structural/internal
 * token types (WS, NEWLINE, EOF, BACKTICK_OPEN, INLINE_SOLVE_START, COMMENT)
 * are intentionally absent — they're either filtered out before reaching
 * this lookup (see Lexer.getHighlightTokens) or simply have nothing
 * meaningful to highlight. COMMENT specifically: it reaches
 * Lexer.getHighlightTokens() (unlike WS/NEWLINE, filtered earlier), so a
 * future "give comments their own color" pass would add a real category
 * here — this is a rendering-scope decision, not a correctness
 * requirement, since COMMENT tokens are already filtered out of the
 * parser's input regardless of how they're highlighted.
 */
const TOKEN_CATEGORY_MAP: Record<string, TokenCategory> = {
	// Literals
	NUMBER: "number",
	BIGINT: "number",
	FLOAT: "number",
	STRING: "string",

	// Keywords (constants, date words, dice, misc grammar keywords)
	PI: "keyword",
	E: "keyword",
	NOW: "keyword",
	TODAY: "keyword",
	TOMORROW: "keyword",
	YESTERDAY: "keyword",
	ROLL: "keyword",
	GLOBAL: "keyword",
	OF: "keyword",
	DURATION_DAY: "keyword",
	DURATION_WEEK: "keyword",
	DURATION_MONTH: "keyword",
	DURATION_YEAR: "keyword",
	DURATION_HOUR: "keyword",
	DURATION_MINUTE: "keyword",
	DURATION_SECOND: "keyword",
	NEXT: "keyword",
	LAST: "keyword",
	UNTIL: "keyword",
	SINCE: "keyword",
	BETWEEN: "keyword",
	FROM: "keyword",
	BEST: "keyword",
	KEYWORD: "keyword",
	TRUE: "keyword",
	FALSE: "keyword",
	IF: "keyword",
	THEN: "keyword",
	ELSE: "keyword",
	AS: "keyword",
	CONVERTER_NAME: "keyword",
	AVERAGE_OF: "keyword",
	MEDIAN_OF: "keyword",
	TOTAL_OF: "keyword",
	COUNT_OF: "keyword",
	LARGER_OF: "keyword",
	SMALLER_OF: "keyword",
	HALF_OF: "keyword",
	MIDPOINT_BETWEEN: "keyword",
	CLAMP: "keyword",
	MAP: "keyword",
	REDUCE: "keyword",
	SUM_FN: "keyword",
	PROD_FN: "keyword",
	TIME_IN: "keyword",
	DATE_IN: "keyword",
	TIME_DIFFERENCE_BETWEEN: "keyword",
	CITY_NAME: "keyword",
	OVER: "keyword",
	RATE_AT: "keyword",
	COMPOUND_INTEREST_ON: "keyword",
	INTEREST_ON: "keyword",
	DAILY_REPAYMENT_ON: "keyword",
	MONTHLY_REPAYMENT_ON: "keyword",
	ANNUAL_REPAYMENT_ON: "keyword",
	TOTAL_REPAYMENT_ON: "keyword",
	DAILY_LOAN_INTEREST_ON: "keyword",
	MONTHLY_LOAN_INTEREST_ON: "keyword",
	ANNUAL_LOAN_INTEREST_ON: "keyword",
	TOTAL_LOAN_INTEREST_ON: "keyword",
	TAX_ON: "keyword",
	TAX_OFF: "keyword",
	IS_TO: "keyword",
	RANDOM_NUMBER: "keyword",
	WHAT_IS: "keyword",
	WHAT_WAS: "keyword",
	VALUE_OF: "keyword",
	WORTH_IN: "keyword",
	IN_YEAR_DOLLARS: "keyword",
	INGREDIENT_NAME: "keyword",
	ASSUMING: "keyword",
	// Datetime — workdays/weekdays/timestamps (packages/datetime/); Time —
	// video timecode (packages/time/). See Token.ts's TokenTypes doc
	// comments for why each is a fused phrase/sequence token rather than a
	// bare keyword.
	WORKDAYS_IN: "keyword",
	WEEKDAY_ON: "keyword",
	WEEKDAY_IN: "keyword",
	MONTH_ON: "keyword",
	MONTH_IN: "keyword",
	WEEK_ON: "keyword",
	WEEK_IN: "keyword",
	BETWEEN_UNIT: "keyword",
	IS_WEEKEND: "keyword",
	IS_WORKDAY: "keyword",
	CURRENT_TIMESTAMP: "keyword",
	TO_DATE: "keyword",
	TO_TIMESTAMP: "keyword",
	VIDEO_TIMECODE: "datetime",
	FRAME_COUNT: "datetime",
	AT: "keyword",

	// Arithmetic / assignment-style operators
	PLUS: "operator",
	MINUS: "operator",
	STAR: "operator",
	SLASH: "operator",
	CARET: "operator",
	PERCENT: "operator",
	LSHIFT: "operator",
	RSHIFT: "operator",
	EQUALS: "operator",
	THEREFORE: "operator",
	INCREASE_BY: "operator",
	DECREASE_BY: "operator",
	OF_WHAT_IS: "keyword",
	ON_WHAT_IS: "keyword",
	OFF_WHAT_IS: "keyword",
	TIMES_BY: "operator",
	MULTIPLY_BY: "operator",
	DIVIDE_BY: "operator",
	MOD: "operator",
	INCREASE: "operator",
	DECREASE: "operator",
	UNICODE_MATH: "operator",
	QUESTION: "operator",
	BANG: "operator",

	// Comparison operators
	NEQ: "comparison",
	IN: "comparison",
	GTE: "comparison",
	LTE: "comparison",
	EQUALITY: "comparison",
	LT: "comparison",
	GT: "comparison",
	LOGICAL_AND: "comparison",
	LOGICAL_OR: "comparison",
	OR: "comparison",

	// Bitwise operators
	BIT_AND: "bitwise",
	BIT_OR: "bitwise",
	BIT_NOT: "bitwise",
	BIT_XOR: "bitwise",

	// Functions
	FUNC: "function",

	// Variable references/definitions — DOLLAR/COLON are the sigils, IDENT is
	// a bare identifier reference. All three are recognized-by-the-grammar
	// variable syntax at LEX time, independent of whether the variable turns
	// out to be defined at eval time (that's a separate, later concern).
	DOLLAR: "variable",
	COLON: "variable",
	IDENT: "variable",

	// Units / conversions / currency symbols
	UNIT: "unit",
	CONVERT: "unit",
	TO: "unit",
	POUND: "unit",
	EURO: "unit",
	YEN: "unit",
	RUBLE: "unit",
	WON: "unit",
	CURRENCY_SYMBOL: "unit",

	// Cross-line data access (packages/lines/)
	PREV: "keyword",
	LINE_REF: "keyword",
	SUM_RANGE_CALL: "keyword",
	AVERAGE_RANGE_CALL: "keyword",
	TOTAL_ABOVE: "keyword",
	SUM_ABOVE: "keyword",
	AVERAGE_ABOVE: "keyword",

	// Datetime literals/durations
	DATETIME_LITERAL: "datetime",
	DURATION: "datetime",

	// Vectors
	VEC2: "vector",
	VEC3: "vector",
	VEC4: "vector",

	// Punctuation — grouping/separators, deliberately neutral/muted rather
	// than left uncategorized: they're still recognized grammar, just not
	// semantically interesting enough to earn a "loud" color.
	LPAREN: "punctuation",
	RPAREN: "punctuation",
	LBRACKET: "punctuation",
	RBRACKET: "punctuation",
	LBRACE: "punctuation",
	RBRACE: "punctuation",
	DOT: "punctuation",
	COMMA: "punctuation",
	SEMICOLON: "punctuation",

	// Errors
	ERROR: "error",
};

/**
 * Token types intentionally left uncategorized — either purely structural
 * (never meant to be visibly styled) or already filtered out upstream
 * before reaching a category lookup. Used only by the completeness test to
 * distinguish "deliberately unstyled" from "forgotten."
 */
export const UNCATEGORIZED_TOKEN_TYPES: ReadonlySet<string> = new Set([
	"WS",
	"NEWLINE",
	"EOF",
	"BACKTICK_OPEN",
	"INLINE_SOLVE_START",
	"COMMENT",
]);

/**
 * Runtime registry for package-contributed categories (e.g. a plugin's
 * custom token types). Overrides/extends the static table above — never
 * replaces it, so a package can't accidentally break core highlighting.
 * Register/unregister symmetry mirrors this codebase's other pluggable
 * registries (e.g. sharedOpRegistry) — see ExpressionEngine.registerPackage
 * / unregisterPackage, which call these on behalf of IEnginePackage.tokenCategories.
 */
const pluginCategories = new Map<string, TokenCategory>();

export function registerTokenCategory(tokenType: string, category: TokenCategory): void {
	pluginCategories.set(tokenType, category);
}

export function unregisterTokenCategory(tokenType: string): void {
	pluginCategories.delete(tokenType);
}

/**
 * Resolve a token type to its semantic category, checking plugin-contributed
 * categories first (so a plugin could theoretically re-categorize a builtin
 * token type, though in practice plugins only ever add categories for their
 * own new types).
 *
 * @returns The category, or `undefined` if the token type has no category —
 *   the signal to a UI adapter that this token should render unstyled.
 */
export function getTokenCategory(tokenType: string): TokenCategory | undefined {
	return pluginCategories.get(tokenType) ?? TOKEN_CATEGORY_MAP[tokenType];
}
