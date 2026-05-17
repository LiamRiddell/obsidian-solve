import { EDatetimeParsingFormat } from "@app/constants/EDatetimeFormat";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class DatetimeProviderSettings {
	constructor(private parent: UserSettings) {}

	get enabled(): boolean {
		return (
			this.parent.settings.datetimeProvider.enabled ??
			DEFAULT_SETTINGS.datetimeProvider.enabled
		);
	}

	set enabled(value: boolean) {
		this.parent.settings.datetimeProvider.enabled = value;
	}

	get parsingFormat(): EDatetimeParsingFormat {
		return (
			this.parent.settings.datetimeProvider.parsingFormat ??
			DEFAULT_SETTINGS.datetimeProvider.parsingFormat
		);
	}

	set parsingFormat(value: EDatetimeParsingFormat) {
		this.parent.settings.datetimeProvider.parsingFormat = value;
	}
}
