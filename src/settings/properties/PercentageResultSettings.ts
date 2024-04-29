import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class PercentageResultSettings {
	constructor(private parent: UserSettings) {}

	get enableSeperator(): boolean {
		return (
			this.parent.settings.percentageResult.enableSeperator ??
			DEFAULT_SETTINGS.percentageResult.enableSeperator
		);
	}

	set enableSeperator(value: boolean) {
		this.parent.settings.percentageResult.enableSeperator = value;
	}

	get decimalPlaces(): number {
		return (
			this.parent.settings.percentageResult.decimalPlaces ??
			DEFAULT_SETTINGS.percentageResult.decimalPlaces
		);
	}

	set decimalPlaces(value: number) {
		this.parent.settings.percentageResult.decimalPlaces = value;
	}
}
