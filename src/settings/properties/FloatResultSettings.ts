import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class FloatResultSettings {
	constructor(private parent: UserSettings) {}

	get decimalPlaces(): number {
		return (
			this.parent.settings.floatResult.decimalPlaces ??
			DEFAULT_SETTINGS.floatResult.decimalPlaces
		);
	}

	set decimalPlaces(value: number) {
		this.parent.settings.floatResult.decimalPlaces = value;
	}
}
