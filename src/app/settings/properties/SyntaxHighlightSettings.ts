import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";
import type { SyntaxHighlightPresetName } from "@app/settings/definition/ISyntaxHighlightSettings";
import {
	FALLBACK_COLOR,
	SOLVE_HIGHLIGHT_CATEGORIES,
	SYNTAX_HIGHLIGHT_PRESETS,
} from "@app/settings/presets/SyntaxHighlightPresets";
import type { SolveTokenCategory } from "@solve-js/language/SolveTokenCategory";

export class SyntaxHighlightSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.syntaxHighlight.enabled ??
			DEFAULT_SETTINGS.syntaxHighlight.enabled
		);
	}
	set enabled(value: boolean) {
		this.parent.settings.syntaxHighlight.enabled = value;
	}

	get preset(): SyntaxHighlightPresetName {
		return (
			this.parent.settings.syntaxHighlight.preset ??
			DEFAULT_SETTINGS.syntaxHighlight.preset
		);
	}
	set preset(value: SyntaxHighlightPresetName) {
		this.parent.settings.syntaxHighlight.preset = value;
	}

	get overrides(): Partial<Record<SolveTokenCategory, string>> {
		return (
			this.parent.settings.syntaxHighlight.overrides ??
			DEFAULT_SETTINGS.syntaxHighlight.overrides
		);
	}

	/** Set (or clear, with `undefined`) a single category's override color. */
	setOverride(category: SolveTokenCategory, value: string | undefined): void {
		const overrides = { ...this.overrides };
		if (value === undefined) {
			delete overrides[category];
		} else {
			overrides[category] = value;
		}
		this.parent.settings.syntaxHighlight.overrides = overrides;
	}

	/**
	 * The single source of truth for "what color actually applies" to a
	 * category — an explicit user override, else the active preset's color,
	 * else a neutral fallback (for categories with no preset entry at all,
	 * e.g. a plugin-contributed one). Used both to apply CSS variables and
	 * to pre-fill the settings UI's color pickers.
	 */
	resolvedColor(category: SolveTokenCategory): string {
		return (
			this.overrides[category] ??
			SYNTAX_HIGHLIGHT_PRESETS[this.preset][category] ??
			FALLBACK_COLOR
		);
	}

	/**
	 * Push every built-in category's resolved color onto `document.body` as
	 * a `--solve-hl-{category}` CSS custom property — the mechanism
	 * styles/highlight.css's `cm-solve-{category}` classes read from. Called
	 * once on plugin load (after settings restore) and again after every
	 * color-related settings change, so the editor updates live without a
	 * reload. Skips entirely (removes the properties) when highlighting is
	 * disabled, so `.cm-solve-*` classes fall back to no color rather than
	 * a stale one — though buildDecorations() also stops adding those
	 * classes at all when disabled, this keeps the two paths consistent.
	 */
	applyCssVariables(): void {
		for (const category of SOLVE_HIGHLIGHT_CATEGORIES) {
			if (this.enabled) {
				document.body.style.setProperty(`--solve-hl-${category}`, this.resolvedColor(category));
			} else {
				document.body.style.removeProperty(`--solve-hl-${category}`);
			}
		}
	}
}
