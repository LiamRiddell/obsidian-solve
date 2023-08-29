import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class HexResultSettings {
	constructor(private parent: UserSettings) {}

	get padding(): boolean {
		return (
			this.parent.settings.hexResult.padding ||
			DEFAULT_SETTINGS.hexResult.padding
		);
	}

	set padding(value: boolean) {
		this.parent.settings.hexResult.padding = value;
	}
}
