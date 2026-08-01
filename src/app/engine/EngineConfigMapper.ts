import type { EngineConfig, ValidationConfig, VMConfig } from "@solve/core/constants";
import type UserSettings from "@app/settings/UserSettings";

/**
 * EngineConfigMapper — single adapter layer between Obsidian plugin settings
 * and the solve-js engine configuration.
 *
 * ### Why this exists
 *
 * The Obsidian plugin has its own settings UI (IEngineSettings, PluginSettings)
 * with user-facing labels, defaults, and descriptions. The engine has its own
 * config system (EngineConfig in Configuration.ts) for internal operation.
 * These are **separate concerns** — the plugin settings are a UX concern, the
 * engine config is an operational concern.
 *
 * This mapper is the **only** place that translates between the two. When the
 * engine adds, removes, or renames config fields, only this file needs to
 * change (plus the engine's own defaults). The rest of the plugin layer
 * (SettingsTab, EngineSettings, IEngineSettings, etc.) stays unchanged.
 *
 * ### Usage
 *
 * ```ts
 * import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
 * const engine = new ExpressionEngine(locale, false,
 *     EngineConfigMapper.toEngineConfig(UserSettings.getInstance())
 * );
 * ```
 *
 * @module EngineConfigMapper
 */
export class EngineConfigMapper {
    /**
     * Build a `Partial<EngineConfig>` from the current Obsidian UserSettings.
     *
     * Only the fields that have corresponding Obsidian UI controls are mapped.
     * Engine config sections without UI controls (date, dice, performance,
     * worker, diagnostic) are omitted so the engine falls through to
     * `DEFAULT_CONFIG` via its internal merge logic.
     *
     * @param settings - The current UserSettings singleton instance.
     * @returns A partial engine config safe to pass to `ExpressionEngine`'s constructor.
     */
    static toEngineConfig(settings: UserSettings): Partial<EngineConfig> {
        const partial: Partial<EngineConfig> = {
            validation: this.mapValidation(settings),
            vm: this.mapVm(settings),
        };

        // Each section included above is populated with every field from its
        // corresponding mapping helper. This ensures no section is ever added
        // as `{}`, which would override ALL defaults in that section with
        // undefined values. Sections without UI controls (date, dice,
        // performance, worker, diagnostic) are omitted entirely, so the
        // engine falls through to DEFAULT_CONFIG via its merge logic.

        return partial;
    }

    // ── Private mapping helpers ──────────────────────────────────────────
    // Each maps a section of the Obsidian settings to the corresponding
    // engine config section. If a field has no Obsidian UI control, no
    // helper is defined — the section simply isn't returned.

    /**
     * Map safety-limit settings from Obsidian UI to engine ValidationConfig.
     *
     * Uses the `EngineSettings` proxy class (settings.engine) rather than the
     * raw `settings.settings.engine.validation` object, because the proxy
     * getters handle backward-compatible fallback for users whose saved
     * settings predate the `validation` field (added in Phase 1.7).
     */
    private static mapValidation(settings: UserSettings): ValidationConfig {
        return {
            maxExpressionLength: settings.engine.maxExpressionLength,
            maxComplexity: settings.engine.maxComplexity,
            maxNestingDepth: settings.engine.maxNestingDepth,
            // Paren auto-balancing is off by default (strict parsing).
            // No Obsidian UI control yet — future config toggle.
            autoBalanceParens: false,
        };
    }

    /**
     * Map VM limit settings from Obsidian UI to engine VMConfig.
     *
     * Uses the `EngineSettings` proxy class (settings.engine) for the same
     * backward-compatible fallback reasons as mapValidation().
     */
    private static mapVm(settings: UserSettings): VMConfig {
        return {
            maxStackDepth: settings.engine.maxStackDepth,
            maxInstructions: settings.engine.maxInstructions,
        };
    }
}
