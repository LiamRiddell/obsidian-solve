import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class ArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled() {
		return (
			this.parent.settings.arithmeticProvider.enabled ??
			DEFAULT_SETTINGS.arithmeticProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.arithmeticProvider.enabled = value;
	}
}
