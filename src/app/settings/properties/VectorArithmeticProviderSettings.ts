import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class VectorArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.vectorArithmeticProvider.enabled ??
			DEFAULT_SETTINGS.vectorArithmeticProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.vectorArithmeticProvider.enabled = value;
	}
}
