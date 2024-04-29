import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class VariableSettings {
	constructor(private parent: UserSettings) {}

	get renderResult(): boolean {
		return (
			this.parent.settings.variable.renderResult ??
			DEFAULT_SETTINGS.variable.renderResult
		);
	}

	set renderResult(value: boolean) {
		this.parent.settings.variable.renderResult = value;
	}
}
