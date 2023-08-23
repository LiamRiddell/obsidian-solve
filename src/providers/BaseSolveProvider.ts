import { PluginEventBus, pluginEventBus } from "@/PluginEventBus";
import { PluginEvents } from "@/constants/PluginEvents";
import { ISolveProvider } from "@/providers/ISolveProvider";
import { SolvePluginSettings } from "@/settings/SolvePluginSettings";

export class BaseSolveProvider implements ISolveProvider {
	name: string;
	eventBus: PluginEventBus;
	settings: SolvePluginSettings | undefined;

	constructor() {
		pluginEventBus.on(
			PluginEvents.SettingsUpdated,
			this.onSettingsUpdate.bind(this)
		);
	}

	provide(sentence: string, raw: boolean): string | undefined {
		throw new Error("Method not implemented.");
	}

	private async onSettingsUpdate(settings: SolvePluginSettings) {
		this.settings = settings;
	}
}
