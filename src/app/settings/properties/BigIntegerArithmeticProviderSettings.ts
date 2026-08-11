import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class BigIntegerArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.bigIntegerArithmeticProvider.enabled ??
			DEFAULT_SETTINGS.bigIntegerArithmeticProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.bigIntegerArithmeticProvider.enabled = value;
	}
}
