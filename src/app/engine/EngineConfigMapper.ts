import { DEFAULT_CONFIG } from "solve-engine/constants";
import type { EngineConfig, ValidationConfig, VMConfig } from "solve-engine/constants";
import {
	BUILTIN_PACKAGES,
	ARITHMETIC_PACKAGE,
	FUNCTION_PACKAGE,
	VECTOR_PACKAGE,
	PERCENTAGE_PACKAGE,
	DATETIME_PACKAGE,
	UOM_PACKAGE,
	DICE_PACKAGE,
	BIGINT_PACKAGE,
} from "solve-engine/packages";
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
 *     EngineConfigMapper.toEngineConfig(UserSettings.getInstance()),
 *     undefined,
 *     EngineConfigMapper.toPackages(UserSettings.getInstance())
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

    /**
     * Build the `packages` array to pass as `ExpressionEngine`'s 5th
     * constructor argument, filtering out any built-in package whose
     * "Provider Management" toggle is off.
     *
     * Not part of `toEngineConfig()`'s `EngineConfig` return value — package
     * selection is a separate constructor parameter (`packages?:
     * IEnginePackage[]`), documented by the engine itself as the mechanism
     * for "selective disable of built-in packages" — not something
     * `EngineConfig` covers at all. `EngineProvider` was constructing every
     * engine with the default `packages` argument (i.e. `BUILTIN_PACKAGES`
     * unfiltered), so every "Provider Management" toggle existed in the
     * settings UI and did nothing.
     *
     * Only maps the 8 packages that already had a settings toggle before
     * this. The engine ships several more built-ins (currency, matrix,
     * map/reduce, symbolic algebra, variables, conditionals, converters,
     * math phrases, finance, weather, lines) with no equivalent toggle —
     * those stay unconditionally enabled, matching today's behavior for
     * them.
     */
    static toPackages(settings: UserSettings): typeof BUILTIN_PACKAGES {
        const disabled = new Set<(typeof BUILTIN_PACKAGES)[number]>();
        if (!settings.arithmeticProvider.enabled) disabled.add(ARITHMETIC_PACKAGE);
        if (!settings.functionArithmeticProvider.enabled) disabled.add(FUNCTION_PACKAGE);
        if (!settings.vectorArithmeticProvider.enabled) disabled.add(VECTOR_PACKAGE);
        if (!settings.percentageArithmeticProvider.enabled) disabled.add(PERCENTAGE_PACKAGE);
        if (!settings.datetimeProvider.enabled) disabled.add(DATETIME_PACKAGE);
        if (!settings.unitOfMeasurementProvider.enabled) disabled.add(UOM_PACKAGE);
        if (!settings.diceProvider.enabled) disabled.add(DICE_PACKAGE);
        if (!settings.bigIntegerArithmeticProvider.enabled) disabled.add(BIGINT_PACKAGE);

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
            // Collection/allocation/function-call limits — no Obsidian UI
            // control yet, same "future config toggle" situation as
            // autoBalanceParens above. Fall back to the engine's own
            // defaults rather than inventing numbers here.
            maxCollectionSize: DEFAULT_CONFIG.vm.maxCollectionSize,
            maxAllocatedElements: DEFAULT_CONFIG.vm.maxAllocatedElements,
            maxFunctionCalls: DEFAULT_CONFIG.vm.maxFunctionCalls,
        };
    }
}
