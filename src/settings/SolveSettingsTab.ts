import { DatetimeParsingFormat } from "@/constants/DatetimeFormat";
import SolveObsidianPlugin from "@/main";
import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
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
		this.displayDatetimeSettings();
		this.displayStyleSettings();
	}

	displayIntroduction() {
		new Setting(this.containerEl).setName("Introduction").setHeading();

		new Setting(this.containerEl).setDesc(
			`Solve is an unobtrusive Obsidian plugin that quietly processes equations and patterns in real time, inspired by NoteMaster's Smart Mode. With solid engineering at its core, Solve enhances note-taking without relying on ChatGPT. For instance, effortlessly calculates date and time expressions (e.g., 'Now + 20 days'), performs arithmetic (e.g., '10 + 5'), and more features are coming soon.`
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
				`Adds the equals sign before arithmetic results to improve the natural reading of expressions. Default is ${DEFAULT_SETTINGS.arithmetic.renderEqualsBeforeResult}`
			)
			.addToggle((toggle) => {
				const value = this.plugin.settings.renderEqualsBeforeResult;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.renderEqualsBeforeResult = value;

					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Number precision")
			.setDesc(
				`Adjust the 'Number Precision' setting to reveal more digits for accuracy or fewer digits for simplicity in number displays. Default is ${DEFAULT_SETTINGS.arithmetic.decimalPoints}`
			)
			.addSlider((slider) => {
				const value = this.plugin.settings.decimalPoints;

				slider.setLimits(0, 17, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.decimalPoints = value;

					slider.showTooltip();

					await this.plugin.saveSettings();
				});
			});
	}

	displayDatetimeSettings() {
		new Setting(this.containerEl).setName("Datetime").setHeading();

		new Setting(this.containerEl)
			.setName("Parsing Format")
			.setDesc(
				"Specify the format to be used for parsing datetime values."
			)
			.addDropdown((dropdown) => {
				const value = this.plugin.settings.datetimeParsingFormat;

				switch (value) {
					case DatetimeParsingFormat.EU:
						dropdown.setValue("European DD/MM/YYYY");
						break;

					case DatetimeParsingFormat.US:
						dropdown.setValue("American - MM/DD/YYYY");
						break;
				}

				dropdown.addOptions({
					EU: "European DD/MM/YYYY",
					US: "American - MM/DD/YYYY",
				});

				dropdown.onChange(async (value) => {
					switch (value) {
						case "EU":
							this.plugin.settings.datetimeParsingFormat =
								DatetimeParsingFormat.EU;
							break;

						case "US":
							this.plugin.settings.datetimeParsingFormat =
								DatetimeParsingFormat.US;
							break;
					}

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
