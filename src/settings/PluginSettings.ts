import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";

export interface InterfaceSettings {
	renderResultEndOfLine: boolean;
}

export interface ArithmeticSettings {
	renderEqualsBeforeResult: boolean;
	decimalPoints: number;
}

export interface DatetimeSettings {
	parsingFormat: EDatetimeParsingFormat;
}

export interface PluginSettings {
	visual: InterfaceSettings;
	arithmetic: ArithmeticSettings;
	datetime: DatetimeSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	visual: {
		renderResultEndOfLine: false,
	},
	arithmetic: {
		renderEqualsBeforeResult: true,
		decimalPoints: 4,
	},
	datetime: {
		parsingFormat: EDatetimeParsingFormat.EU,
	},
};
