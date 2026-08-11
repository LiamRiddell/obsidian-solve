import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class PercentageResultSettings {
	constructor(private parent: UserSettings) {}

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
