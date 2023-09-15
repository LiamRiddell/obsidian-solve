import { EParserMode } from "@/constants/EParserMode";
import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class ParserSettings {
	constructor(private parent: UserSettings) {}

	get triggerMode() {
		return (
			this.parent.settings.parser.triggerMode ??
			DEFAULT_SETTINGS.parser.triggerMode
		);
	}

	set triggerMode(value: EParserMode) {
		this.parent.settings.parser.triggerMode = value;
	}
}
