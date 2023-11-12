import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class PercentageArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.percentageArithmeticProvider.enabled ??
			DEFAULT_SETTINGS.percentageArithmeticProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.percentageArithmeticProvider.enabled = value;
	}
}
