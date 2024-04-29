import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

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
