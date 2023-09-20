import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

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

	get unitNames(): boolean {
		return (
			this.parent.settings.unitOfMeasurementResult.unitNames ??
			DEFAULT_SETTINGS.unitOfMeasurementResult.unitNames
		);
	}

	set unitNames(value: boolean) {
		this.parent.settings.unitOfMeasurementResult.unitNames = value;
	}
}
