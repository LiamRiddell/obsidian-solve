import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class EngineSettings {
	constructor(private parent: UserSettings) {}

	get explicitMode(): boolean {
		return (
			this.parent.settings.engine.explicitMode ??
			DEFAULT_SETTINGS.engine.explicitMode
		);
	}

	set explicitMode(value: boolean) {
		this.parent.settings.engine.explicitMode = value;
	}
}
