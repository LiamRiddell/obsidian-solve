import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class ArithmeticProviderSettings {
	constructor(private parent: UserSettings) {}

	get renderEqualsBeforeResult() {
		return (
			this.parent.settings.arithmeticProvider.renderEqualsBeforeResult ??
			DEFAULT_SETTINGS.arithmeticProvider.renderEqualsBeforeResult
		);
	}

	set renderEqualsBeforeResult(value: boolean) {
		this.parent.settings.arithmeticProvider.renderEqualsBeforeResult =
			value;
	}
}
