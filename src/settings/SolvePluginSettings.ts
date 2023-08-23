export interface SolveArithmeticSettings {
	renderEqualsBeforeResult: boolean;
	decimalPoints: number;
}

export interface SolvePluginSettings {
	renderResultEndOfLine: boolean;
	arithmeticSettings: SolveArithmeticSettings;
}

export const DEFAULT_SETTINGS: SolvePluginSettings = {
	renderResultEndOfLine: false,
	arithmeticSettings: {
		renderEqualsBeforeResult: true,
		decimalPoints: 4,
	},
};
