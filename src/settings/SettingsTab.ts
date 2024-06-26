import { ANIMATE_CSS_TRANSITIONS_OPTIONS } from "@/constants/AnimateCssOptions";
import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import { FeatureFlagClass } from "@/constants/EFeatureFlagClass";
import { SUPPORTED_SEPARATOR_LOCALES } from "@/constants/SupportedSeparators";
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
		this.displayEngineSettings();
		this.displayInterfaceSettings();
		this.displayInlineSolveSettings();
		this.displayVariablesSettings();

		// Providers Settings
		this.displayProviderManagementSettings();
		this.displayArithmeticProviderSettings();
		this.displayDatetimeProviderSettings();

		// Reuslts
		this.displayNumberSettings();
		this.displayIntegerSettings();
		this.displayFloatSettings();
		this.displayPercentageSettings();
		this.displayDatetimeSettings();
		this.displayHexSettings();
		this.displayUnitOfMeasurementSettings();

		this.displayStyleSettings();
	}

	displayIntroduction() {
		new Setting(this.containerEl).setName("Introduction").setHeading();

		new Setting(this.containerEl).setDesc(
			`Solve is an unobtrusive Obsidian plugin that quietly processes equations and patterns in real time, inspired by NoteMaster's Smart Mode. With solid engineering at its core, Solve enhances note-taking without relying on ChatGPT. For instance, effortlessly calculates date and time expressions (e.g., 'Now + 20 days'), performs arithmetic (e.g., '10 + 5'), and more features are coming soon.`
		);
	}

	displayEngineSettings() {
		new Setting(this.containerEl).setName("Engine").setHeading();

		new Setting(this.containerEl)
			.setName("Explicit mode")
			.setDesc(
				`Solve will only display results for sentences ending with '=' sign. Default is ${DEFAULT_SETTINGS.engine.explicitMode}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.engine.explicitMode)
					.onChange(async (value) => {
						this.plugin.settings.engine.explicitMode = value;

						await this.plugin.saveSettings();
					})
			);
	}

	displayInlineSolveSettings() {
		new Setting(this.containerEl).setName("Inline Solve").setHeading();

		new Setting(this.containerEl)
			.setName("Include expression when committing")
			.setDesc(
				`Solve will include the expression in the format \`EXPRESSION = RESULT\` when committing e.g. '2 + 2 = 4'. Default is ${DEFAULT_SETTINGS.inlineSolve.includeExpressionOnCommit}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.inlineSolve
							.includeExpressionOnCommit
					)
					.onChange(async (value) => {
						this.plugin.settings.inlineSolve.includeExpressionOnCommit =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Include backticks when committing")
			.setDesc(`Solve will enclose the committed expression in backticks when committing. Default is ${DEFAULT_SETTINGS.inlineSolve.includeBackticksOnCommit}`)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.inlineSolve.includeBackticksOnCommit)
					.onChange(async (value) => {
						this.plugin.settings.inlineSolve.includeBackticksOnCommit =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Include equals when committing")
			.setDesc(`Solve will include the equals when committing. Has no effect if solve is set to include the expression. Default is ${DEFAULT_SETTINGS.inlineSolve.includeBackticksOnCommit}`)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.inlineSolve.includeEqualsOnCommit)
					.onChange(async (value) => {
						this.plugin.settings.inlineSolve.includeEqualsOnCommit =
							value;

						await this.plugin.saveSettings();
					})
			);
	}

	displayVariablesSettings() {
		new Setting(this.containerEl).setName("Variable").setHeading();

		new Setting(this.containerEl)
			.setName("Show variable result")
			.setDesc(
				`Solve will display results at the end of variables. Default is ${DEFAULT_SETTINGS.variable.renderResult}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.variable.renderResult)
					.onChange(async (value) => {
						this.plugin.settings.variable.renderResult = value;

						await this.plugin.saveSettings();
					})
			);
	}

	displayProviderManagementSettings() {
		new Setting(this.containerEl)
			.setName("Provider Management")
			.setHeading();

		new Setting(this.containerEl)
			.setName("Arithmetic")
			.setDesc(
				`Enable the arithmetic provider e.g. 10 + 2. Default is ${DEFAULT_SETTINGS.arithmeticProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.arithmeticProvider.enabled)
					.onChange(async (value) => {
						this.plugin.settings.arithmeticProvider.enabled = value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Function Arithmetic")
			.setDesc(
				`Enable the function arithmetic provider e.g. sin(), cos(). Default is ${DEFAULT_SETTINGS.functionArithmeticProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.functionArithmeticProvider.enabled
					)
					.onChange(async (value) => {
						this.plugin.settings.functionArithmeticProvider.enabled =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Vector Arithmetic")
			.setDesc(
				`Enable the vector arithmetic provider e.g. (10, 22.3), vec3(1.0, 23, 18.3). Default is ${DEFAULT_SETTINGS.vectorArithmeticProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.vectorArithmeticProvider.enabled
					)
					.onChange(async (value) => {
						this.plugin.settings.vectorArithmeticProvider.enabled =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Percentage")
			.setDesc(
				`Enable the percentage provider e.g. 10% of 200, increase 20 by 10%. Default is ${DEFAULT_SETTINGS.percentageArithmeticProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.percentageArithmeticProvider
							.enabled
					)
					.onChange(async (value) => {
						this.plugin.settings.percentageArithmeticProvider.enabled =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Datetime")
			.setDesc(
				`Enable the datetime provider e.g. today + 20 days, last monday. Default is ${DEFAULT_SETTINGS.datetimeProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.datetimeProvider.enabled)
					.onChange(async (value) => {
						this.plugin.settings.datetimeProvider.enabled = value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Unit of Measurement")
			.setDesc(
				`Enable the unit of measurement provider e.g. 10cm + 20, 200cm to m. Default is ${DEFAULT_SETTINGS.unitOfMeasurementProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.unitOfMeasurementProvider.enabled
					)
					.onChange(async (value) => {
						this.plugin.settings.unitOfMeasurementProvider.enabled =
							value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Dice")
			.setDesc(
				`Enable the dice provider e.g. roll(1, 100), roll between 1 and 12. Default is ${DEFAULT_SETTINGS.diceProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.diceProvider.enabled)
					.onChange(async (value) => {
						this.plugin.settings.diceProvider.enabled = value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Binary (BigInteger)")
			.setDesc(
				`Enable the binary (BigInteger) provider e.g. 0b10101 >> 4, right shift. Default is ${DEFAULT_SETTINGS.bigIntegerArithmeticProvider.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.bigIntegerArithmeticProvider
							.enabled
					)
					.onChange(async (value) => {
						this.plugin.settings.bigIntegerArithmeticProvider.enabled =
							value;

						await this.plugin.saveSettings();
					})
			);
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

		// Animation
		new Setting(this.containerEl)
			.setName("Animate results")
			.setDesc(
				`Enable animate results on the current active line that is being solved. Default is ${DEFAULT_SETTINGS.interface.animateResults}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.interface.animateResults)
					.onChange(async (value) => {
						this.plugin.settings.interface.animateResults = value;

						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Animation transition")
			.setDesc(
				`Specify the transition class name from Animate.css to use on animated results. Default is ${DEFAULT_SETTINGS.interface.animationClass.replace(
					"animate__",
					""
				)}`
			)
			.addDropdown((dropdown) => {
				const value = this.plugin.settings.interface.animationClass;

				dropdown.addOptions(ANIMATE_CSS_TRANSITIONS_OPTIONS);

				dropdown.setValue(value);

				dropdown.onChange(async (value) => {
					this.plugin.settings.interface.animationClass = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Animation duration")
			.setDesc(
				`Specify the animation duration (CSS format) to use for animated results. Default is ${DEFAULT_SETTINGS.interface.animationDuration}`
			)
			.addText((text) => {
				const value = this.plugin.settings.interface.animationDuration;

				text.setValue(value);

				text.onChange(async (value) => {
					this.plugin.settings.interface.animationDuration = value;
					await this.plugin.saveSettings();
				});
			});
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
			.setName("Parsing format")
			.setDesc(
				"Specify the format to be used for parsing datetime values."
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

	displayNumberSettings() {
		new Setting(this.containerEl)
			.setName("Number Result (Shared)")
			.setHeading();

		new Setting(this.containerEl)
			.setName("Decimal seperator")
			.setDesc(
				`Specify the seperator format to be used for decimals. Default is ${"English"}`
			)
			.addDropdown((dropdown) => {
				const value =
					this.plugin.settings.numberResult.decimalSeparatorLocale;

				dropdown.addOptions(SUPPORTED_SEPARATOR_LOCALES);

				dropdown.setValue(value);

				dropdown.onChange(async (value) => {
					this.plugin.settings.numberResult.decimalSeparatorLocale =
						value;
					await this.plugin.saveSettings();
				});
			});
	}

	displayIntegerSettings() {
		new Setting(this.containerEl).setName("Integer Result").setHeading();

		new Setting(this.containerEl)
			.setName("Display thousand separators")
			.setDesc(
				`Adds thousand separators to integer results. Default is ${DEFAULT_SETTINGS.integerResult.enableSeperator}`
			)
			.addToggle((toggle) => {
				const value =
					this.plugin.settings.integerResult.enableSeperator;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.integerResult.enableSeperator = value;

					await this.plugin.saveSettings();
				});
			});
	}

	displayFloatSettings() {
		new Setting(this.containerEl).setName("Float Result").setHeading();

		new Setting(this.containerEl)
			.setName("Display thousand separators")
			.setDesc(
				`Adds thousand separators to float results. Default is ${DEFAULT_SETTINGS.floatResult.enableSeperator}`
			)
			.addToggle((toggle) => {
				const value = this.plugin.settings.floatResult.enableSeperator;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.floatResult.enableSeperator = value;

					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Decimal places")
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
			.setName("Display thousand separators")
			.setDesc(
				`Adds thousand separators to percentage results. Default is ${DEFAULT_SETTINGS.percentageResult.enableSeperator}`
			)
			.addToggle((toggle) => {
				const value =
					this.plugin.settings.percentageResult.enableSeperator;

				toggle.setValue(value);

				toggle.onChange(async (value) => {
					this.plugin.settings.percentageResult.enableSeperator =
						value;

					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Decimal places")
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
			.setName("Value padding")
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
			.setName("Padding zeros")
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

	displayUnitOfMeasurementSettings() {
		new Setting(this.containerEl)
			.setName("Unit of Measurement Result")
			.setHeading();

		new Setting(this.containerEl)
			.setName("Decimal places")
			.setDesc(
				`Adjust the number of decimal places, setting to reveal more digits for accuracy or fewer digits for simplicity in number displays. Default is ${DEFAULT_SETTINGS.unitOfMeasurementResult.decimalPlaces}`
			)
			.addSlider((slider) => {
				const value =
					this.plugin.settings.unitOfMeasurementResult.decimalPlaces;

				slider.setLimits(0, 17, 1);
				slider.setValue(value);

				slider.sliderEl.addEventListener("mouseover", () => {
					slider.showTooltip();
				});

				slider.onChange(async (value) => {
					this.plugin.settings.unitOfMeasurementResult.decimalPlaces =
						value;

					slider.showTooltip();

					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Show unit name")
			.setDesc(
				`Show the unit name in the result instead of the unit abbreviation. Default is ${DEFAULT_SETTINGS.unitOfMeasurementResult.unitNames}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.unitOfMeasurementResult.unitNames
					)
					.onChange(async (value) => {
						this.plugin.settings.unitOfMeasurementResult.unitNames =
							value;

						await this.plugin.saveSettings();
					})
			);
	}

	displayStyleSettings() {
		new Setting(this.containerEl).setName("Style").setHeading();
		new Setting(this.containerEl).setDesc(
			"The font family and font size settings are inherited from the Obsidian text font. For more advanced styling options, consider using the Style Settings plugin by @mgmeyers."
		);
	}
}
