import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class FunctionArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.functionArithmeticProvider.enabled ??
			DEFAULT_SETTINGS.functionArithmeticProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.functionArithmeticProvider.enabled = value;
	}
}
