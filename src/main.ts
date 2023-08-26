import { MarkdownEditorViewPlugin } from "@/MarkdownEditorViewPlugin";
import { pluginEventBus } from "@/PluginEventBus";
import { solveProviderManager } from "@/SolveProviderManager";
import { PluginEvents } from "@/constants/PluginEvents";
import { PluginStatus } from "@/constants/PluginStatus";
import { DEFAULT_SETTINGS } from "@/settings/SolvePluginSettings";
import { SolveSettingTab } from "@/settings/SolveSettingsTab";
import UserSettings from "@/settings/UserSettings";
import { FeatureFlagClass } from "@/utilities/FeatureFlagClass";
import { SolveObsidianEvents } from "@/utilities/SolveObsidianEvents";
import { ViewPlugin } from "@codemirror/view";
import { Plugin } from "obsidian";

export default class SolveObsidianPlugin extends Plugin {
	settings: UserSettings;
	statusBarItemEl: HTMLElement;

	public async onload() {
		console.debug("[Solve] onload()");

		await this.registerEvents();

		await this.restoreUserSettings();
		console.debug("[Solve] User Settings Restored");

		await this.registerSettings();
		console.debug("[Solve] Registered: Settings");

		this.app.workspace.trigger("parse-style-settings");
		console.debug("[Solve] Triggered Event: parse-style-setting");

		this.registerEvent(
			this.app.workspace.on(
				// @ts-expect-error
				SolveObsidianEvents.SolveObsidianEvents,
				// @ts-expect-error
				([provider]: [ISolveProvider]) => {
					console.debug(
						"[Solve] Registered Custom Provider",
						provider
					);
					if (provider && provider.name && provider.name.length) {
						solveProviderManager.registerProvider(provider);
						this.app.workspace.activeEditor?.editor?.refresh();
					}
				}
			)
		);
		console.debug(`[Solve] Registered: Register Provider Event Listener`);

		await this.registerEditorExtensions();
		console.debug(`[Solve] Registered: Editor Extensions`);

		this.statusBarItemEl = this.addStatusBarItem();
		pluginEventBus.emit(PluginEvents.StatusBarUpdate, PluginStatus.Idle);
	}

	public onunload() {
		console.debug("[Solve] onunload()");
		pluginEventBus.removeAllListeners();
	}

	public async saveSettings() {
		const rawSettings = this.settings.getRaw();

		console.debug("[Solve] Settings Saved", rawSettings);

		await this.saveData(rawSettings);

		this.app.workspace.updateOptions();
	}

	private async registerEvents() {
		pluginEventBus.on(
			PluginEvents.StatusBarUpdate,
			this.onStatusBarUpdateEvent.bind(this)
		);
	}

	private async restoreUserSettings() {
		this.settings = UserSettings.getInstance();

		this.settings.updateSettings(
			Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		);

		await this.restoreFeatureFlags();
	}

	private async registerSettings() {
		this.addSettingTab(new SolveSettingTab(this.app, this));
	}

	private async registerEditorExtensions() {
		const markdownEditorViewPlugin =
			await this.buildMarkdownEditorViewPlugin();

		this.registerEditorExtension(markdownEditorViewPlugin);
	}

	private async buildMarkdownEditorViewPlugin() {
		return ViewPlugin.fromClass(MarkdownEditorViewPlugin, {
			decorations: (value: MarkdownEditorViewPlugin) => value.decorations,
		});
	}

	private async restoreFeatureFlags() {
		if (this.settings.renderResultEndOfLine) {
			document.body.classList.add(FeatureFlagClass.RenderEndOfLineResult);
		} else {
			document.body.classList.remove(
				FeatureFlagClass.RenderEndOfLineResult
			);
		}
	}

	private async onStatusBarUpdateEvent(status: PluginStatus) {
		switch (status) {
			case PluginStatus.Solving:
				this.statusBarItemEl.setText("Solve 🤔");
				break;

			case PluginStatus.Idle:
				setTimeout(() => this.statusBarItemEl.setText("Solve 😴"), 700);
				break;
		}
	}
}
