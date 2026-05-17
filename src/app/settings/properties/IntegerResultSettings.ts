import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class IntegerResultSettings {
	constructor(private parent: UserSettings) {}

	get enableSeperator(): boolean {
		return (
			this.parent.settings.integerResult.enableSeperator ??
			DEFAULT_SETTINGS.integerResult.enableSeperator
		);
	}

	set enableSeperator(value: boolean) {
		this.parent.settings.integerResult.enableSeperator = value;
	}
}
