import type { SolveTokenCategory } from "@solve-js/language/SolveTokenCategory";

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
export function categoryClassName(category: SolveTokenCategory): string {
	return `cm-solve-${category}`;
}
