import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

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
