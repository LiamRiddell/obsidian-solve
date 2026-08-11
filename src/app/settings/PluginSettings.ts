import { IPluginSettings } from "@app/settings/definition/IPluginSettings";

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

	syntaxHighlight: {
		enabled: true,
		preset: "one-dark",
		overrides: {},
	},

	completions: {
		// Off by default — measurably affects typing latency (prefix
		// matching + candidate list construction on every keystroke).
		// Users who want it can opt in from settings.
		enabled: false,
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
	floatResult: {
		enableSeperator: false,
		decimalPlaces: 2,
	},
	percentageResult: {
		decimalPlaces: 2,
	},
	hexResult: {
		enablePadding: false,
		paddingZeros: 8,
	},
	unitOfMeasurementResult: {
		decimalPlaces: 2,
	},
};
