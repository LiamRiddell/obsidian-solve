export interface SolveArithmeticSettings {
	renderEqualsBeforeResult: boolean;
	decimalPoints: number;
}

export interface SolvePluginSettings {
	renderResultEndOfLine: boolean;
	arithmetic: SolveArithmeticSettings;
}

export const DEFAULT_SETTINGS: SolvePluginSettings = {
	renderResultEndOfLine: false,
	arithmetic: {
		renderEqualsBeforeResult: true,
		decimalPoints: 4,
	},
};
