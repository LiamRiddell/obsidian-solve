import { SolveViewPlugin } from "@/plugins/SolveViewPlugin";
import { PluginSpec, ViewPlugin } from "@codemirror/view";
import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SolvePluginSettings,
} from "./settings/SolvePluginSettings";
import { SolveSettingTab } from "./settings/SolveSettingsTab";

// https://marcus.se.net/obsidian-plugin-docs/editor/extensions/decorations

export default class MyPlugin extends Plugin {
	settings: SolvePluginSettings;
	statusBarItemEl: HTMLElement;

	async onload() {
		console.debug("[Solve] onload()");

		await this.loadSettings();
		await this.registerSettings();
		console.debug("[Solve] Settings Loaded");

		this.app.workspace.trigger("parse-style-settings");
		console.debug("[Solve] Triggered Event: parse-style-setting");

		const pluginSpec: PluginSpec<SolveViewPlugin> = {
			decorations: (value: SolveViewPlugin) => value.decorations,
		};

		const solveViewPlugin = ViewPlugin.fromClass(
			SolveViewPlugin,
			pluginSpec
		);
		this.registerEditorExtension(solveViewPlugin);
		console.debug(`[Solve] Registered Editor Extension: SolveViewPlugin`);

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText("Solve - Ready ⚡");

		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: "sample-editor-command",
		// 	name: "Sample editor command",
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection("Sample Editor Command");
		// 	},
		// });

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		// 	console.log("click", evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(
		// 	window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		// );
	}

	onunload() {}

	async registerSettings() {
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SolveSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
