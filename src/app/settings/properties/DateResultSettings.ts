import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";
import { DATE_OUTPUT_FORMATS, type DateOutputFormat } from "@app/settings/definition/IDateResultSettings";

export class DateResultSettings {
	constructor(private parent: UserSettings) {}

	get format(): DateOutputFormat {
		const saved = this.parent.settings.dateResult?.format;
		// A saved value that is not a format falls back to the default.
		return saved !== undefined && DATE_OUTPUT_FORMATS.includes(saved) ? saved : DEFAULT_SETTINGS.dateResult.format;
	}

	set format(value: DateOutputFormat) {
		this.parent.settings.dateResult.format = value;
	}
}
