import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";

/**
 * Shared engine provider — ensures a single ExpressionEngine instance
 * is used across all frontend components (CodeMirror plugin, highlights, workers).
 *
 * This fixes the double-instantiation problem where MarkdownEditorViewPlugin
 * and SolveHighlightProvider each created their own engine, causing:
 *  - Double memory usage
 *  - Variable/dynamic source isolation between components
 *  - Plugin registrations only affecting one engine
 */
class EngineProvider {
	private static _instance: ExpressionEngine | null = null;
	private static _localeOverride: string | null = null;

	private constructor() {}

	/**
	 * Get or create the shared ExpressionEngine instance.
	 * Re-uses existing instance if locale matches, recreates if locale changes.
	 */
	static get(): ExpressionEngine {
		const settings = UserSettings.getInstance();
		const locale = settings.settings.engine.locale;

		if (!this._instance || this._localeOverride !== locale) {
			this._localeOverride = locale;
			this._instance = new ExpressionEngine(locale, false);
			logger.debug(`[EngineProvider] Created new ExpressionEngine (locale=${locale})`);
		}

		return this._instance;
	}

/**
 	 * Force recreation of the engine (e.g., after plugin registration changes
 	 * or document switch to prevent variable leaking).
 	 */
	static reset(): void {
		if (this._instance) {
			this._instance.clear();
			this._instance = null;
			logger.debug("[EngineProvider] Engine reset");
		}
	}

	/**
	 * Access the underlying engine without creating a new one.
	 * Returns null if no engine has been instantiated yet.
	 */
	static peek(): ExpressionEngine | null {
		return this._instance;
	}
}

export const sharedEngine = EngineProvider.get.bind(EngineProvider);
export { EngineProvider };