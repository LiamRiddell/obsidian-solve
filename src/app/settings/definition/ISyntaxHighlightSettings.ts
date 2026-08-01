import type { TokenCategory } from "@solve-js/language/TokenCategory";

export type SyntaxHighlightPresetName = "one-dark" | "github-light";

export interface ISyntaxHighlightSettings {
	enabled: boolean;
	preset: SyntaxHighlightPresetName;
	/**
	 * Per-category color overrides on top of the selected preset. Absent =
	 * use the preset's color for that category. Switching presets does NOT
	 * clear these — a preset sets the base, overrides are the user's own
	 * deltas on top of whichever preset is active.
	 */
	overrides: Partial<Record<TokenCategory, string>>;
}
