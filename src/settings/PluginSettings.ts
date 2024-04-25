import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { IPluginSettings } from "@/settings/definition/IPluginSettings";
import moment from "moment";

export const DEFAULT_SETTINGS: IPluginSettings = {
	engine: {
		explicitMode: false,
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
