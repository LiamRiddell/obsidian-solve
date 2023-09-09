import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class DatetimeProviderSettings {
	constructor(private parent: UserSettings) {}

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
