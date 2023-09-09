import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class DatetimeResultSettings {
	constructor(private parent: UserSettings) {}

	get format(): string {
		return (
			this.parent.settings.datetimeResult.format ??
			DEFAULT_SETTINGS.datetimeResult.format
		);
	}

	set format(value: string) {
		this.parent.settings.datetimeResult.format = value;
	}
}
