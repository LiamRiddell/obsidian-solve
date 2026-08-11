import type { TokenCategory } from "solve-engine/language";
import type { SyntaxHighlightPresetName } from "@app/settings/definition/ISyntaxHighlightSettings";

/**
 * Every BUILT-IN category gets a settings-tab color picker. Plugin-contributed
 * categories (e.g. OSRS's "osrs-item") are intentionally excluded — they're
 * open-ended and package-specific, not something every preset can reasonably
 * anticipate; they still render with a sensible default via styles/highlight.css
 * and FALLBACK_COLOR below, just without a dedicated picker.
 */
export const SOLVE_HIGHLIGHT_CATEGORIES: TokenCategory[] = [
	"number",
	"string",
	"keyword",
	"operator",
	"comparison",
	"bitwise",
	"function",
	"variable",
	"unit",
	"datetime",
	"vector",
	"punctuation",
	"error",
];

/** Human-readable label for each built-in category, for the settings UI. */
export const CATEGORY_LABELS: Record<string, string> = {
	number: "Number",
	string: "String",
	keyword: "Keyword",
	operator: "Operator",
	comparison: "Comparison",
	bitwise: "Bitwise",
	function: "Function",
	variable: "Variable",
	unit: "Unit",
	datetime: "Datetime",
	vector: "Vector",
	punctuation: "Punctuation",
	error: "Error",
};

/** Used when a category (typically plugin-contributed) has no preset entry at all. */
export const FALLBACK_COLOR = "#ABB2BF";

type Palette = Record<TokenCategory, string>;

const ONE_DARK: Palette = {
	number: "#61AFEF",
	string: "#98C379",
	keyword: "#C678DD",
	operator: "#ABB2BF",
	comparison: "#56B6C2",
	bitwise: "#56B6C2",
	function: "#E5C07B",
	variable: "#E06C75",
	unit: "#56B6C2",
	datetime: "#D19A66",
	vector: "#D19A66",
	punctuation: "#5C6370",
	error: "#E06C75",
};

const GITHUB_LIGHT: Palette = {
	number: "#005CC5",
	string: "#22863A",
	keyword: "#D73A49",
	operator: "#24292E",
	comparison: "#005CC5",
	bitwise: "#005CC5",
	function: "#6F42C1",
	variable: "#E36209",
	unit: "#005CC5",
	datetime: "#B08800",
	vector: "#B08800",
	punctuation: "#6A737D",
	error: "#D73A49",
};

export const SYNTAX_HIGHLIGHT_PRESETS: Record<SyntaxHighlightPresetName, Palette> = {
	"one-dark": ONE_DARK,
	"github-light": GITHUB_LIGHT,
};

export const SYNTAX_HIGHLIGHT_PRESET_LABELS: Record<SyntaxHighlightPresetName, string> = {
	"one-dark": "One Dark",
	"github-light": "GitHub Light",
};
