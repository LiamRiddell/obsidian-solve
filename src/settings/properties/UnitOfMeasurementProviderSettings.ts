import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class UnitOfMeasurementProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.unitOfMeasurementProvider.enabled ??
			DEFAULT_SETTINGS.unitOfMeasurementProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.unitOfMeasurementProvider.enabled = value;
	}
}
