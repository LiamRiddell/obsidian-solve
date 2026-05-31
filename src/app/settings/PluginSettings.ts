import { EDatetimeParsingFormat } from "@app/constants/EDatetimeFormat";
import { IPluginSettings } from "@app/settings/definition/IPluginSettings";
import moment from "moment";

/**
 * Default plugin settings used as the baseline for `deepMerge`.
 *
 * Every configurable value is listed here so saved settings from older
 * plugin versions are automatically backfilled with defaults for new fields.
 *
 * @see {@link deepMerge} for the merge strategy.
 */
export const DEFAULT_SETTINGS: IPluginSettings = {
	engine: {
		explicitMode: false,
		locale: "en",
		validation: {
			maxExpressionLength: 2000,
			maxComplexity: 500,
			maxNestingDepth: 50,
		},
		vm: {
			maxStackDepth: 200,
			maxInstructions: 50000,
		},
	},

	interface: {
		renderResultEndOfLine: false,
		showStatusBarCompanion: true,
		animateResults: true,
		animationClass: "animate__pulse",
		animationDuration: "200ms",
	},

	inlineSolve: {
		includeExpressionOnCommit: false,
		includeBackticksOnCommit: true,
		includeEqualsOnCommit: true,
	},

	variable: {
		renderResult: true,
	},

	// Providers
	arithmeticProvider: {
		enabled: true,
		renderEqualsBeforeResult: true,
	},
	functionArithmeticProvider: {
		enabled: true,
	},
	vectorArithmeticProvider: {
		enabled: true,
	},
	percentageArithmeticProvider: {
		enabled: true,
	},
	datetimeProvider: {
		enabled: true,
		parsingFormat: EDatetimeParsingFormat.EU,
	},
	unitOfMeasurementProvider: {
		enabled: true,
	},
	diceProvider: {
		enabled: true,
	},
	bigIntegerArithmeticProvider: {
		enabled: true,
	},

	// Results
	numberResult: {
		decimalSeparatorLocale: "en-US",
	},
	integerResult: {
		enableSeperator: false,
	},
	floatResult: {
		enableSeperator: false,
		decimalPlaces: 2,
	},
	percentageResult: {
		enableSeperator: false,
		decimalPlaces: 2,
	},
	datetimeResult: {
		format: moment.defaultFormat,
	},
	hexResult: {
		enablePadding: false,
		paddingZeros: 8,
	},
	unitOfMeasurementResult: {
		decimalPlaces: 2,
		unitNames: false,
	},
};
