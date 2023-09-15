import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { FeatureFlagClass } from "@/constants/EFeatureFlagClass";
import { EParserMode } from "@/constants/EParserMode";
import SolvePlugin from "@/main";
import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import { App, PluginSettingTab, Setting } from "obsidian";

export class SettingTab extends PluginSettingTab {
	plugin: SolvePlugin;

	constructor(app: App, plugin: SolvePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();

		this.displayIntroduction();

		this.displayParserSettings();

		this.displayInterfaceSettings();

		// Providers
		this.displayArithmeticProviderSettings();
		this.displayDatetimeProviderSettings();

		// Reuslts
		//this.displayIntegerSettings();
		this.displayFloatSettings();
		this.displayPercentageSettings();
		this.displayDatetimeSettings();
		this.displayHexSettings();

		this.displayStyleSettings();
	}

	displayIntroduction() {
		new Setting(this.containerEl).setName("Introduction").setHeading();

		new Setting(this.containerEl).setDesc(
			`Solve is an unobtrusive Obsidian plugin that quietly processes equations and patterns in real time, inspired by NoteMaster's Smart Mode. With solid engineering at its core, Solve enhances note-taking without relying on ChatGPT. For instance, effortlessly calculates date and time expressions (e.g., 'Now + 20 days'), performs arithmetic (e.g., '10 + 5'), and more features are coming soon.`
		);
	}

	displayParserSettings() {
		new Setting(this.containerEl).setName("Parser").setHeading();

		new Setting(this.containerEl)
			.setName("Trigger Mode")
			.setDesc(
				`Specify which is mode used for triggering Solve. When in Manual mode solve will wait for the user to run the Solve Refresh command. This can be bound to a hotkey in the Obsidian settings. Default is ${DEFAULT_SETTINGS.parser.triggerMode}`
			)
			.addDropdown((dropdown) => {
				const value = this.plugin.settings.parser.triggerMode;

				dropdown.addOptions({
					Automatic: "Automatic",
					Manual: "Manual",
				});

				switch (value) {
					case EParserMode.Automatic:
						dropdown.setValue("Automatic");
						break;

					case EParserMode.Manual:
						dropdown.setValue("Manual");
						break;
				}

				dropdown.onChange(async (value) => {
					switch (value) {
						case "Automatic":
							this.plugin.settings.parser.triggerMode =
								EParserMode.Automatic;
							break;

						case "Manual":
							this.plugin.settings.parser.triggerMode =
								EParserMode.Manual;
							break;
					}

					await this.plugin.saveSettings();
				});
			});
	}

	displayInterfaceSettings() {
		new Setting(this.containerEl).setName("Interface").setHeading();

		new Setting(this.containerEl)
			.setName("Show result at end of line")
			.setDesc(
				`Position results at the conclusion of lines, not text's termination. Be cautious when using this setting, as it may cause overlap between the displayed result and the text on the same line. Default is ${DEFAULT_SETTINGS.interface.renderResultEndOfLine}`
			)
			.addToggle((toggle) => {
				const value =
					this.plugin.settings.interface.renderResultEndOfLine;

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
					this.plugin.settings.interface.renderResultEndOfLine =
						value;

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

		new Setting(this.containerEl)
			.setName("Show status bar companion")
			.setDesc(
				`Show the Solve companion in the status bar. Default is ${DEFAULT_SETTINGS.interface.showStatusBarCompanion}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.interface.showStatusBarCompanion
					)
					.onChange(async (value) => {
						this.plugin.settings.interface.showStatusBarCompanion =
							value;

						if (value) {
							this.plugin.setStatusBarCompanionVisibility(true);
						} else {
							this.plugin.setStatusBarCompanionVisibility(false);
						}

						await this.plugin.saveSettings();
					})
			);
	}

	displayArithmeticProviderSettings() {
		new Setting(this.containerEl)
			.setName("Arithmetic Provider")
			.setHeading();
		new Setting(this.containerEl)
			.setName("Show = before the result")
			.setDesc(
				`Adds the equals sign before arithmetic results to improve the natural reading of expressions. Default is ${DEFAULT_SETTINGS.arithmeticProvider.renderEqualsBeforeResult}`
			)
			.addToggle((toggle) => {
				const value =
					this.plugin.settings.arithmeticProvider
						.renderEqualsBeforeResult;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.arithmeticProvider.renderEqualsBeforeResult =
						value;

					await this.plugin.saveSettings();
				});
			});
	}

	displayDatetimeProviderSettings() {
		new Setting(this.containerEl).setName("Datetime Provider").setHeading();

		new Setting(this.containerEl)
			.setName("Parsing Format")
			.setDesc(
				`Specify the format to be used for parsing datetime values. Default is ${DEFAULT_SETTINGS.parser.triggerMode}`
			)
			.addDropdown((dropdown) => {
				const value =
					this.plugin.settings.datetimeProvider.parsingFormat;

				dropdown.addOptions({
					EU: "European DD/MM/YYYY",
					US: "American - MM/DD/YYYY",
				});

				switch (value) {
					case EDatetimeParsingFormat.EU:
						dropdown.setValue("EU");
						break;

					case EDatetimeParsingFormat.US:
						dropdown.setValue("US");
						break;
				}

				dropdown.onChange(async (value) => {
					switch (value) {
						case "EU":
							this.plugin.settings.datetimeProvider.parsingFormat =
								EDatetimeParsingFormat.EU;
							break;

						case "US":
							this.plugin.settings.datetimeProvider.parsingFormat =
								EDatetimeParsingFormat.US;
							break;
					}

					await this.plugin.saveSettings();
				});
			});
	}

	displayIntegerSettings() {
		new Setting(this.containerEl).setName("Integer Result").setHeading();
	}

	displayFloatSettings() {
		new Setting(this.containerEl).setName("Float Result").setHeading();

		new Setting(this.containerEl)
			.setName("Decimal Places")
			.setDesc(
				`Adjust the number of decimal places, setting to reveal more digits for accuracy or fewer digits for simplicity in number displays. Default is ${DEFAULT_SETTINGS.floatResult.decimalPlaces}`
			)
			.addSlider((slider) => {
				const value = this.plugin.settings.floatResult.decimalPlaces;

				slider.setLimits(0, 17, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.floatResult.decimalPlaces = value;

					slider.showTooltip();

					await this.plugin.saveSettings();
				});
			});
	}

	displayPercentageSettings() {
		new Setting(this.containerEl).setName("Percentage Result").setHeading();

		new Setting(this.containerEl)
			.setName("Decimal Places")
			.setDesc(
				`Adjust the number of decimal places, setting to reveal more digits for accuracy or fewer digits for simplicity in number displays. Default is ${DEFAULT_SETTINGS.percentageResult.decimalPlaces}`
			)
			.addSlider((slider) => {
				const value =
					this.plugin.settings.percentageResult.decimalPlaces;

				slider.setLimits(0, 17, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.percentageResult.decimalPlaces = value;

					slider.showTooltip();

					await this.plugin.saveSettings();
				});
			});
	}

	displayDatetimeSettings() {
		new Setting(this.containerEl).setName("Datetime Result").setHeading();

		new Setting(this.containerEl)
			.setName("Format")
			.setDesc(
				`The format to use when displaying a date in the result. Default is ${DEFAULT_SETTINGS.datetimeResult.format}`
			)
			.addMomentFormat((control) =>
				control
					.setValue(this.plugin.settings.datetimeResult.format)
					.onChange(async (value) => {
						this.plugin.settings.datetimeResult.format = value;

						await this.plugin.saveSettings();
					})
			);
	}

	displayHexSettings() {
		new Setting(this.containerEl).setName("Hex Result").setHeading();

		new Setting(this.containerEl)
			.setName("Value Padding")
			.setDesc(
				`Enable or disable padding the start of hex values with zeros for consistency. Default is ${DEFAULT_SETTINGS.hexResult.enablePadding}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hexResult.enablePadding)
					.onChange(async (value) => {
						this.plugin.settings.hexResult.enablePadding = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Padding Zeros")
			.setDesc(
				`Specify the number of leading zeros to pad hex values with for a uniform appearance. Default is ${DEFAULT_SETTINGS.hexResult.paddingZeros}`
			)
			.addSlider((slider) => {
				const value = this.plugin.settings.hexResult.paddingZeros;

				slider.setLimits(0, 32, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.hexResult.paddingZeros = value;

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
