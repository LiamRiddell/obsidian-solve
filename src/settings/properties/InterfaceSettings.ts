import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class InterfaceSettings {
	constructor(private parent: UserSettings) {}

	get renderResultEndOfLine(): boolean {
		return (
			this.parent.settings.interface.renderResultEndOfLine ??
			DEFAULT_SETTINGS.interface.renderResultEndOfLine
		);
	}

	set renderResultEndOfLine(value: boolean) {
		this.parent.settings.interface.renderResultEndOfLine = value;
	}

	get showStatusBarCompanion(): boolean {
		return (
			this.parent.settings.interface.showStatusBarCompanion ??
			DEFAULT_SETTINGS.interface.showStatusBarCompanion
		);
	}

	set showStatusBarCompanion(value: boolean) {
		this.parent.settings.interface.showStatusBarCompanion = value;
	}
}
