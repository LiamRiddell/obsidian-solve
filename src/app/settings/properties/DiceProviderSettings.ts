import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class DiceProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.diceProvider.enabled ??
			DEFAULT_SETTINGS.diceProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.diceProvider.enabled = value;
	}
}
