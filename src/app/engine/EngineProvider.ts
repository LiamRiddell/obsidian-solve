import type { ExpressionEngine } from "solve-engine/engine";
import { createPluginEngine, engineSettingsKey } from "@app/engine/createPluginEngine";
import UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";
/**
 * Shared engine provider — ensures a single ExpressionEngine instance
 * is used across all frontend components (CodeMirror plugin, highlights, workers).
 *
 * This fixes the double-instantiation problem where MarkdownEditorViewPlugin
 * and the syntax-highlighting language service each created their own engine, causing:
 *  - Double memory usage
 *  - Variable/dynamic source isolation between components
 *  - Plugin registrations only affecting one engine
 */
class EngineProvider {
	private static _instance: ExpressionEngine | null = null;
	/** The settings the instance was built from (`engineSettingsKey`). */
	private static _key: string | null = null;

	private constructor() {}

	/**
	 * Get or create the shared ExpressionEngine instance.
	 * Re-uses the existing instance while the settings it was built from are
	 * unchanged, and builds a new one when any of them changes: the locale, a
	 * limit, or a Provider Management toggle (#94). It was rebuilt on a locale
	 * change alone, so a toggle never reached the "Evaluate expression" command.
	 */
	static get(): ExpressionEngine {
		const settings = UserSettings.getInstance();
		const key = engineSettingsKey(settings);

		if (!this._instance || this._key !== key) {
			this._instance?.clear();
			this._key = key;
			this._instance = createPluginEngine(settings);
			logger.debug(`[EngineProvider] Created new ExpressionEngine (locale=${settings.settings.engine.locale})`);
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
			this._key = null;
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