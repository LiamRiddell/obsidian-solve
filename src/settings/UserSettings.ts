import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { DEFAULT_SETTINGS, PluginSettings } from "@/settings/PluginSettings";

export default class UserSettings {
	private static instance: UserSettings | null = null;
	private settings: PluginSettings;

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

	public updateSettings(settings: PluginSettings) {
		this.settings = settings;
	}

	//#region Visual
	get renderResultEndOfLine(): boolean {
		return (
			this.settings.visual.renderResultEndOfLine ||
			DEFAULT_SETTINGS.visual.renderResultEndOfLine
		);
	}

	set renderResultEndOfLine(value: boolean) {
		this.settings.visual.renderResultEndOfLine = value;
	}
	//#endregion

	//#region Arithmetic
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
	//#endregion

	//#region Datetime
	get datetimeParsingFormat(): EDatetimeParsingFormat {
		return (
			this.settings.datetime.parsingFormat ||
			DEFAULT_SETTINGS.datetime.parsingFormat
		);
	}

	set datetimeParsingFormat(value: EDatetimeParsingFormat) {
		this.settings.datetime.parsingFormat = value;
	}

	//#endregion
}
