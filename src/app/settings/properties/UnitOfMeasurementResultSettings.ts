import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class UnitOfMeasurementResultSettings {
	constructor(private parent: UserSettings) {}

	get decimalPlaces(): number {
		return (
			this.parent.settings.unitOfMeasurementResult.decimalPlaces ??
			DEFAULT_SETTINGS.unitOfMeasurementResult.decimalPlaces
		);
	}

	set decimalPlaces(value: number) {
		this.parent.settings.unitOfMeasurementResult.decimalPlaces = value;
	}
}
