import {
	DEFAULT_SETTINGS,
	SolvePluginSettings,
} from "@/settings/SolvePluginSettings";

export default class UserSettings {
	private static instance: UserSettings | null = null;
	private settings: SolvePluginSettings;

	private constructor() {
		this.settings = DEFAULT_SETTINGS;
	}

	static getInstance(): UserSettings {
		if (!UserSettings.instance) {
			UserSettings.instance = new UserSettings();
		}
		return UserSettings.instance;
	}

	public getRaw() {
		return this.settings;
	}

	public updateSettings(settings: SolvePluginSettings) {
		this.settings = settings;
	}

	get renderResultEndOfLine(): boolean {
		return (
			this.settings.renderResultEndOfLine ||
			DEFAULT_SETTINGS.renderResultEndOfLine
		);
	}

	set renderResultEndOfLine(value: boolean) {
		this.renderResultEndOfLine = value;
	}

	get renderEqualsBeforeResult() {
		return (
			this.settings.arithmetic.renderEqualsBeforeResult ||
			DEFAULT_SETTINGS.arithmetic.renderEqualsBeforeResult
		);
	}

	set renderEqualsBeforeResult(value: boolean) {
		this.settings.arithmetic.renderEqualsBeforeResult = value;
	}

	get decimalPoints(): number {
		return (
			this.settings.arithmetic.decimalPoints ||
			DEFAULT_SETTINGS.arithmetic.decimalPoints
		);
	}

	set decimalPoints(value: number) {
		this.settings.arithmetic.decimalPoints = value;
	}
}
