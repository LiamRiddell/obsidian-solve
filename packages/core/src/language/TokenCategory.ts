/**
 * Editor-agnostic semantic classification for a lexer token.
 *
 * This is the entire contract solve-js's language service exposes to any
 * editor integration (CodeMirror, VS Code, ...): a category, nothing about
 * how it should be rendered. CSS class names, VS Code semantic-token
 * indices, etc. are all downstream adapter concerns — see
 * `language/adapters/`.
 *
 * The built-in categories cover every core (non-plugin) token type. Solve-js
 * packages may contribute additional, open-ended category strings for their
 * own custom token types (see `registerTokenCategory` in TokenCategoryMap.ts)
 * — the `(string & {})` union member keeps those assignable without widening
 * the whole type to a bare `string` and losing autocomplete for the built-ins.
 */
export type TokenCategory =
	| "number"
	| "string"
	| "keyword"
	| "operator"
	| "comparison"
	| "bitwise"
	| "function"
	| "variable"
	| "unit"
	| "datetime"
	| "vector"
	| "punctuation"
	| "error"
	| (string & {});
