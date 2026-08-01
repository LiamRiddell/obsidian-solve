import type { TokenCategory } from "@solve-js/language/TokenCategory";
import type { CompletionItem } from "@solve-js/language/LanguageService";

/**
 * The only CodeMirror-specific thing in this whole feature: maps a semantic
 * category to a predictable, stable CSS class name for use with
 * `Decoration.mark({ class: categoryClassName(token.category) })`.
 *
 * Deliberately trivial — the category name IS the class-name key
 * (`"number"` → `cm-solve-number`), so there's no separate table to keep in
 * sync as categories grow. A brand-new category (including one contributed
 * by a solve-js package at runtime) automatically gets a matching,
 * predictable class name with zero changes here.
 *
 * Actual colors are pure CSS, resolved from `--solve-hl-{category}` custom
 * properties by each consumer (src/app, playground) — this module only ever
 * produces class name strings; it has no dependency on `@codemirror/*`
 * itself; each consumer builds its own `Decoration`/`RangeSetBuilder` calls.
 */
export function categoryClassName(category: TokenCategory): string {
	return `cm-solve-${category}`;
}

/**
 * Maps a semantic category to one of `@codemirror/autocomplete`'s built-in
 * completion "type" strings (which drive its default gutter icon) — the
 * only other CodeMirror-specific thing this feature needs. Falls back to
 * "text" for anything unmapped, including plugin-contributed categories
 * (e.g. OSRS's "osrs-item") — a reasonable neutral default rather than a
 * hard failure for a category this adapter doesn't know about yet.
 *
 * No `@codemirror/autocomplete` import here — the returned object shape is
 * structurally compatible with CM6's `Completion` type by duck typing, so
 * `solve-js` gains no new dependency; the actual `CompletionSource`
 * function (reading `CompletionContext`, building a `CompletionResult`)
 * lives in each consumer (src/app, playground), same tier as
 * `buildDecorations()` already is for highlighting.
 */
const CATEGORY_TO_COMPLETION_TYPE: Partial<Record<TokenCategory, string>> = {
	keyword: "keyword",
	operator: "keyword",
	comparison: "keyword",
	bitwise: "keyword",
	function: "function",
	variable: "variable",
	unit: "type",
	datetime: "keyword",
	vector: "type",
};

export function completionItemToOption(item: CompletionItem): { label: string; type: string; detail?: string } {
	return { label: item.label, type: CATEGORY_TO_COMPLETION_TYPE[item.category] ?? "text", detail: item.detail };
}
