import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class CompletionSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.completions.enabled ??
			DEFAULT_SETTINGS.completions.enabled
		);
	}
	set enabled(value: boolean) {
		this.parent.settings.completions.enabled = value;
	}
}
