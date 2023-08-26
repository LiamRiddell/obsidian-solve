export interface InterfaceSettings {
	renderResultEndOfLine: boolean;
}

export interface ArithmeticSettings {
	renderEqualsBeforeResult: boolean;
	decimalPoints: number;
}

export interface PluginSettings {
	visual: InterfaceSettings;
	arithmetic: ArithmeticSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	visual: {
		renderResultEndOfLine: false,
	},
	arithmetic: {
		renderEqualsBeforeResult: true,
		decimalPoints: 4,
	},
};
