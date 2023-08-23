import SolveObsidianPlugin from "@/main";
import { DEFAULT_SETTINGS } from "@/settings/SolvePluginSettings";
import { FeatureFlagClass } from "@/utilities/FeatureFlagClass";
import { App, PluginSettingTab, Setting } from "obsidian";

export class SolveSettingTab extends PluginSettingTab {
	plugin: SolveObsidianPlugin;

	constructor(app: App, plugin: SolveObsidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();
		this.displayIntroduction();
		this.displayVisualSettings();
		this.displayArithmeticSettings();
		this.displayStyleSettings();
	}

	displayIntroduction() {
		const introductionSetting = new Setting(this.containerEl)
			.setName("Welcome to Solve")
			.setHeading();

		introductionSetting.infoEl.classList.add("os--beta-tag");

		new Setting(this.containerEl).setDesc(
			`Introducing Solve: an unobtrusive Obsidian plugin that quietly processes equations and patterns in real time, inspired by NoteMaster's Smart Mode. With solid engineering at its core, Solve enhances note-taking without relying on ChatGPT. For instance, effortlessly calculates date and time expressions (e.g., 'Now + 20 days'), performs arithmetic (e.g., '10 + 5'), and more features are coming soon.`
		);
	}

	displayVisualSettings() {
		new Setting(this.containerEl).setName("Visual").setHeading();

		new Setting(this.containerEl)
			.setName("Show result at end of line")
			.setDesc(
				`Position results at the conclusion of lines, not text's termination. Be cautious when using this setting, as it may cause overlap between the displayed result and the text on the same line. Default is ${DEFAULT_SETTINGS.renderResultEndOfLine}`
			)
			.addToggle((toggle) => {
				const value = this.plugin.settings.renderResultEndOfLine;

				toggle.setValue(value);

				if (value) {
					document.body.classList.add(
						FeatureFlagClass.RenderEndOfLineResult
					);
				} else {
					document.body.classList.remove(
						FeatureFlagClass.RenderEndOfLineResult
					);
				}

				toggle.onChange(async (value) => {
					this.plugin.settings.renderResultEndOfLine = value;

					if (value) {
						document.body.classList.add(
							FeatureFlagClass.RenderEndOfLineResult
						);
					} else {
						document.body.classList.remove(
							FeatureFlagClass.RenderEndOfLineResult
						);
					}

					await this.plugin.saveSettings();
				});
			});
	}

	displayArithmeticSettings() {
		new Setting(this.containerEl).setName("Arithmetic").setHeading();
		new Setting(this.containerEl)
			.setName("Show = before the result")
			.setDesc(
				`Adds the equals sign before arithmetic results to improve the natural reading of expressions. Default is ${DEFAULT_SETTINGS.arithmeticSettings.renderEqualsBeforeResult}`
			)
			.addToggle((toggle) => {
				const value =
					this.plugin.settings.arithmeticSettings
						.renderEqualsBeforeResult;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.arithmeticSettings.renderEqualsBeforeResult =
						value;

					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Number precision")
			.setDesc(
				`Adjust the 'Number Precision' setting to reveal more digits for accuracy or fewer digits for simplicity in number displays. Default is ${DEFAULT_SETTINGS.arithmeticSettings.decimalPoints}`
			)
			.addSlider((slider) => {
				const value =
					this.plugin.settings.arithmeticSettings.decimalPoints;

				slider.setLimits(0, 17, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.arithmeticSettings.decimalPoints =
						value;

					slider.showTooltip();

					await this.plugin.saveSettings();
				});
			});
	}

	displayStyleSettings() {
		new Setting(this.containerEl).setName("Style").setHeading();
		new Setting(this.containerEl).setDesc(
			"The font family and font size settings are inherited from the Obsidian text font. For more advanced styling options, consider using the Style Settings plugin by @mgmeyers."
		);
	}
}
