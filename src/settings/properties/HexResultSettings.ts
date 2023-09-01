import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class HexResultSettings {
	constructor(private parent: UserSettings) {}

	get enablePadding(): boolean {
		return (
			this.parent.settings.hexResult.enablePadding ||
			DEFAULT_SETTINGS.hexResult.enablePadding
		);
	}

	set enablePadding(value: boolean) {
		this.parent.settings.hexResult.enablePadding = value;
	}

	get paddingZeros(): number {
		return (
			this.parent.settings.hexResult.paddingZeros ||
			DEFAULT_SETTINGS.hexResult.paddingZeros
		);
	}

	set paddingZeros(value: number) {
		this.parent.settings.hexResult.paddingZeros = value;
	}
}
