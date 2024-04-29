import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class NumberResultSettings {
	constructor(private parent: UserSettings) {}

	get decimalSeparatorLocale(): string {
		return (
			this.parent.settings.numberResult.decimalSeparatorLocale ??
			DEFAULT_SETTINGS.numberResult.decimalSeparatorLocale
		);
	}

	set decimalSeparatorLocale(value: string) {
		this.parent.settings.numberResult.decimalSeparatorLocale = value;
	}
}
