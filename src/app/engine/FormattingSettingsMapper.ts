import type { FormattingSettings } from "solve-engine/format";
import type UserSettings from "@app/settings/UserSettings";

/**
 * FormattingSettingsMapper — single adapter layer between Obsidian plugin
 * settings and solve-engine's output-formatting config (`formatValue()`'s
 * optional `settings` parameter).
 *
 * ### Why this exists
 *
 * `formatValue()` accepts a `FormattingSettings` object controlling decimal
 * places, thousand separators, hex padding, etc. Every call site in this
 * plugin was calling `formatValue(value)` with no second argument, silently
 * falling back to `DEFAULT_FORMATTING_SETTINGS` — every one of the "Results"
 * settings sections in SettingsTab.ts existed and could be toggled, but
 * nothing read the values back out. This mapper is the fix: the one place
 * that translates Obsidian's settings shape into the engine's, mirroring
 * {@link EngineConfigMapper}'s own role for `EngineConfig`.
 *
 * `FormattingSettings` covers exactly five sections — `numberResult`,
 * `floatResult`, `percentageResult`, `hexResult`, `unitOfMeasurementResult`
 * — there is no equivalent for `integerResult` or `datetimeResult` (the
 * engine has no separate integer-formatting path — `ValueType.Number` is
 * unified, and `autoFormatIntegerOrFloat()` derives whether to show
 * decimals from the value itself — and datetime rendering is fixed/
 * locale-only). Those settings sections were removed rather than mapped
 * here; see the SettingsTab.ts history for the underlying audit.
 *
 * ### Usage
 *
 * ```ts
 * formatValue(value, FormattingSettingsMapper.toFormattingSettings(userSettings))
 * ```
 */
export class FormattingSettingsMapper {
	static toFormattingSettings(settings: UserSettings): FormattingSettings {
		return {
			numberResult: {
				decimalSeparatorLocale: settings.numberResult.decimalSeparatorLocale,
			},
			floatResult: {
				decimalPlaces: settings.floatResult.decimalPlaces,
				enableSeperator: settings.floatResult.enableSeperator,
			},
			percentageResult: {
				decimalPlaces: settings.percentageResult.decimalPlaces,
			},
			hexResult: {
				enablePadding: settings.hexResult.enablePadding,
				paddingZeros: settings.hexResult.paddingZeros,
			},
			unitOfMeasurementResult: {
				decimalPlaces: settings.unitOfMeasurementResult.decimalPlaces,
			},
		};
	}
}
