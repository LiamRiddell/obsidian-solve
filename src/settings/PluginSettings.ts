import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { IPluginSettings } from "@/settings/definition/IPluginSettings";
import moment from "moment";

export const DEFAULT_SETTINGS: IPluginSettings = {
	interface: {
		renderResultEndOfLine: false,
		showStatusBarCompanion: true,
	},

	// Providers
	arithmeticProvider: {
		renderEqualsBeforeResult: true,
	},
	datetimeProvider: {
		parsingFormat: EDatetimeParsingFormat.EU,
	},

	// Results
	integerResult: {},
	floatResult: {
		decimalPlaces: 2,
	},
	percentageResult: {
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
