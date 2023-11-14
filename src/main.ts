import { MarkdownEditorViewPlugin } from "@/codemirror/MarkdownEditorViewPlugin";
import { FeatureFlagClass } from "@/constants/EFeatureFlagClass";
import { EPluginEvent } from "@/constants/EPluginEvent";
import { EPluginStatus } from "@/constants/EPluginStatus";
import { ESolveEvents } from "@/constants/ESolveEvents";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import { solveProviderManager } from "@/providers/ProviderManager";
import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import { SettingTab } from "@/settings/SettingsTab";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { ViewPlugin } from "@codemirror/view";
import { Plugin } from "obsidian";

export default class SolvePlugin extends Plugin {
	settings: UserSettings;
	statusBarItemEl: HTMLElement;

	public async onload() {
		logger.debug("[Solve] onload()");

		await this.registerEvents();

		await this.restoreUserSettings();
		logger.debug("[Solve] User Settings Restored");

		await this.registerSettings();
		logger.debug("[Solve] Registered: Settings");

		this.app.workspace.trigger("parse-style-settings");
		logger.debug("[Solve] Triggered Event: parse-style-setting");

		this.registerEvent(
			this.app.workspace.on(
				// @ts-expect-error
				ESolveEvents.SolveObsidianEvents,
				// @ts-expect-error
				([provider]: [ISolveProvider]) => {
					logger.debug(
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
		logger.debug(`[Solve] Registered: Register Provider Event Listener`);

		await this.registerEditorExtensions();
		logger.debug(`[Solve] Registered: Editor Extensions`);

		await this.addStatusBarCompanion();
		logger.debug(`[Solve] Added: Status Bar Companion`);
	}

	public onunload() {
		logger.debug("[Solve] onunload()");
		pluginEventBus.removeAllListeners();
	}

	public async saveSettings() {
		const rawSettings = this.settings.settings;

		logger.debug("[Solve] Settings Saved", rawSettings);

		await this.saveData(rawSettings);

		this.app.workspace.updateOptions();
	}

	private async registerEvents() {
		pluginEventBus.on(
			EPluginEvent.StatusBarUpdate,
			this.onStatusBarUpdateEvent.bind(this)
		);

		pluginEventBus.on(
			EPluginEvent.WriteResult,
			this.onWriteResultEvent.bind(this)
		);
	}

	private async restoreUserSettings() {
		this.settings = UserSettings.getInstance();

		const savedSettings = await this.loadData();

		this.settings.updateSettings(
			Object.assign({}, DEFAULT_SETTINGS, savedSettings)
		);

		await this.restoreFeatureFlags();
	}

	private async registerSettings() {
		this.addSettingTab(new SettingTab(this.app, this));
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
		if (this.settings.interface.renderResultEndOfLine) {
			document.body.classList.add(FeatureFlagClass.RenderEndOfLineResult);
		} else {
			document.body.classList.remove(
				FeatureFlagClass.RenderEndOfLineResult
			);
		}
	}

	private async addStatusBarCompanion() {
		this.statusBarItemEl = this.addStatusBarItem();

		if (!this.settings.interface.showStatusBarCompanion) {
			this.setStatusBarCompanionVisibility(false);
		}

		pluginEventBus.emit(EPluginEvent.StatusBarUpdate, EPluginStatus.Idle);
	}

	public async setStatusBarCompanionVisibility(visible: boolean) {
		if (visible) {
			this.statusBarItemEl.style.display = "inline-block";
		} else {
			this.statusBarItemEl.style.display = "none";
		}
	}

	private async onStatusBarUpdateEvent(status: EPluginStatus) {
		switch (status) {
			case EPluginStatus.Solving:
				this.statusBarItemEl.setText("Solve 🤔");
				break;

			case EPluginStatus.Idle:
				setTimeout(() => this.statusBarItemEl.setText("Solve 😴"), 700);
				break;
		}
	}

	private async onWriteResultEvent(lineNumber: number, resultValue: string) {
		const lineNumberZeroIndexed = Math.max(0, lineNumber - 1);

		const lineText = this.app.workspace.activeEditor?.editor?.getLine(
			lineNumberZeroIndexed
		);

		this.app.workspace.activeEditor?.editor?.setLine(
			lineNumberZeroIndexed,
			`${lineText?.trimEnd()} ${resultValue}`
		);
	}
}
