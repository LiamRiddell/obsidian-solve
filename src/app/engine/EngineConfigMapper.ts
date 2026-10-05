import type { EngineConfigOverride, ValidationConfig, VMConfig } from "solve-engine/constants";
import {
	BUILTIN_PACKAGES,
	ARITHMETIC_PACKAGE,
	FUNCTION_PACKAGE,
	VECTOR_PACKAGE,
	PERCENTAGE_PACKAGE,
	DATETIME_PACKAGE,
	UOM_PACKAGE,
	DICE_PACKAGE,
} from "solve-engine/packages";
import type UserSettings from "@app/settings/UserSettings";
import { PROVIDER_TOGGLES, type ProviderSettingKey } from "@app/settings/ProviderToggles";

/** The engine package each Provider Management toggle turns off. */
const PACKAGE_OF: Record<ProviderSettingKey, (typeof BUILTIN_PACKAGES)[number]> = {
    arithmeticProvider: ARITHMETIC_PACKAGE,
    functionArithmeticProvider: FUNCTION_PACKAGE,
    vectorArithmeticProvider: VECTOR_PACKAGE,
    percentageArithmeticProvider: PERCENTAGE_PACKAGE,
    datetimeProvider: DATETIME_PACKAGE,
    unitOfMeasurementProvider: UOM_PACKAGE,
    diceProvider: DICE_PACKAGE,
};

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
 * const settings = UserSettings.getInstance();
 * const engine = new ExpressionEngine({
 *     locale: settings.settings.engine.locale,
 *     config: EngineConfigMapper.toEngineConfig(settings),
 *     packages: EngineConfigMapper.toPackages(settings),
 * });
 * ```
 *
 * @module EngineConfigMapper
 */
export class EngineConfigMapper {
    /**
     * Build the engine's config override from the current Obsidian UserSettings.
     *
     * Only the fields that have corresponding Obsidian UI controls are mapped.
     * solve-engine 2.x merges an override field by field within each section
     * (`EngineConfigOverride`), so a field the plugin has no control for is
     * simply left out and keeps the engine's own default. Sections without UI
     * controls (date, dice, performance, worker, diagnostic) are omitted.
     *
     * @param settings - The current UserSettings singleton instance.
     * @returns The override to pass as `config` to `new ExpressionEngine({ ... })`.
     */
    static toEngineConfig(settings: UserSettings): EngineConfigOverride {
        return {
            validation: this.mapValidation(settings),
            vm: this.mapVm(settings),
        };
    }

    /**
     * Build the `packages` option to pass to `new ExpressionEngine({ ... })`,
     * filtering out any built-in package whose "Provider Management" toggle
     * is off.
     *
     * Not part of `toEngineConfig()`'s return value: package selection is
     * the engine's separate `packages` option, documented by the engine
     * itself as the mechanism for "selective disable of built-in packages",
     * not something the config covers at all.
     *
     * The toggles are `PROVIDER_TOGGLES`, seven of the engine's 47 built-in
     * packages; the rest stay on. The eighth toggle the plugin once had,
     * "Binary (BigInteger)", turned off a package whose forms (`0b1010`,
     * `123n`, `0b10101 >> 4`) solve-engine 2.x reads in its core, so it
     * changed nothing and was removed. Its saved setting is kept and ignored.
     */
    static toPackages(settings: UserSettings): typeof BUILTIN_PACKAGES {
        const disabled = new Set<(typeof BUILTIN_PACKAGES)[number]>();
        for (const toggle of PROVIDER_TOGGLES) {
            if (!settings[toggle.setting].enabled) disabled.add(PACKAGE_OF[toggle.setting]);
        }
        return BUILTIN_PACKAGES.filter((pkg) => !disabled.has(pkg));
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
    private static mapValidation(settings: UserSettings): Partial<ValidationConfig> {
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
     * backward-compatible fallback reasons as mapValidation(). The limits
     * with no Obsidian UI control (collections, allocations, function calls,
     * goal-seek iterations) are left out, so the engine keeps its own
     * defaults for them and stays the one place those numbers live.
     */
    private static mapVm(settings: UserSettings): Partial<VMConfig> {
        return {
            maxStackDepth: settings.engine.maxStackDepth,
            maxInstructions: settings.engine.maxInstructions,
        };
    }
}
