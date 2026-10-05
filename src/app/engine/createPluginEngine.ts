import { ExpressionEngine } from "solve-engine/engine";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import type UserSettings from "@app/settings/UserSettings";
import { logger } from "@app/utilities/Logger";

/**
 * Build an engine the way the plugin uses one, from its own settings: the
 * locale, the config override and the Provider Management package selection,
 * through solve-engine 2.x's options object (#91).
 *
 * Both the shared engine (`EngineProvider`) and each editor pane build theirs
 * here, so the two cannot drift apart again: before the 2.x port the pane
 * engine was given no packages and so ignored every Provider Management
 * toggle.
 *
 * A locale the engine cannot build with falls back to `en`, with a warning,
 * rather than leaving the pane without an engine. solve-engine 2.40.0 throws
 * for a locale named like an `Object.prototype` property (`constructor`,
 * `toString`), which a hand-edited settings file can hold.
 *
 * @param settings - The plugin's settings.
 * @returns The engine.
 */
export function createPluginEngine(settings: UserSettings): ExpressionEngine {
	const config = EngineConfigMapper.toEngineConfig(settings);
	const packages = EngineConfigMapper.toPackages(settings);
	const locale = settings.settings.engine.locale;
	try {
		return new ExpressionEngine({ locale, config, packages });
	} catch (error) {
		logger.warn(`[Solve] The engine could not be built with the locale ${JSON.stringify(locale)}, so English is used: ${(error as Error).message}`);
		return new ExpressionEngine({ locale: "en", config, packages });
	}
}
