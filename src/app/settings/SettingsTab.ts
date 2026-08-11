import { ANIMATE_CSS_TRANSITIONS_OPTIONS } from "@app/constants/AnimateCssOptions";
import { EDatetimeParsingFormat } from "@app/constants/EDatetimeFormat";
import { FeatureFlagClass } from "@app/constants/EFeatureFlagClass";
import { SUPPORTED_SEPARATOR_LOCALES } from "@app/constants/SupportedSeparators";
import SolvePlugin from "@app/main";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import type { SyntaxHighlightPresetName } from "@app/settings/definition/ISyntaxHighlightSettings";
import {
	CATEGORY_LABELS,
	SOLVE_HIGHLIGHT_CATEGORIES,
	SYNTAX_HIGHLIGHT_PRESET_LABELS,
} from "@app/settings/presets/SyntaxHighlightPresets";
import { App, PluginSettingTab, Setting } from "obsidian";

/**
 * Obsidian settings tab for the Solve plugin.
 *
 * Renders all configuration sections: engine safety limits, interface toggles,
 * inline-solve preferences, provider management, and per-type result formatting.
 * Uses Obsidian's built-in {@link PluginSettingTab} framework.
 */
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
		// Hidden for now — not ready for user-facing configuration yet.
		// The settings/features themselves still work off their defaults;
		// this just hides the UI to change them. Uncomment to re-enable.
		// this.displaySyntaxHighlightSettings();
		// this.displayCompletionSettings();
		this.displayInlineSolveSettings();
		// this.displayVariablesSettings(); — hidden for now, see note above.

		// Providers Settings
		// this.displayProviderManagementSettings(); — hidden for now, see note above.
		this.displayArithmeticProviderSettings();
		this.displayDatetimeProviderSettings();

		// Reuslts
		this.displayNumberSettings();
		this.displayFloatSettings();
		this.displayPercentageSettings();
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

		// ── Safety limits ────────────────────────────────────────────────
		new Setting(this.containerEl).setName("Safety limits").setHeading();

		new Setting(this.containerEl)
			.setName("Max expression length")
			.setDesc(
				`Maximum allowed expression length in characters. Prevents runaway expressions. Default is ${DEFAULT_SETTINGS.engine.validation.maxExpressionLength}. Changes take effect after restart.`
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.engine.maxExpressionLength))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.engine.maxExpressionLength = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(this.containerEl)
			.setName("Max expression complexity")
			.setDesc(
				`Maximum expression complexity score (token count + functionCalls×5 + nesting×10). Protects against deeply nested expressions. Default is ${DEFAULT_SETTINGS.engine.validation.maxComplexity}. Changes take effect after restart.`
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.engine.maxComplexity))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.engine.maxComplexity = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(this.containerEl)
			.setName("Max nesting depth")
			.setDesc(
				`Maximum parentheses nesting depth. Prevents stack overflow from deeply nested expressions. Default is ${DEFAULT_SETTINGS.engine.validation.maxNestingDepth}. Changes take effect after restart.`
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.engine.maxNestingDepth))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.engine.maxNestingDepth = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// ── VM limits ───────────────────────────────────────────────────
		new Setting(this.containerEl).setName("VM limits").setHeading();

		new Setting(this.containerEl)
			.setName("Max stack depth")
			.setDesc(
				`Maximum stack depth (value slots) for VM execution. Prevents stack overflow in recursive code. Default is ${DEFAULT_SETTINGS.engine.vm.maxStackDepth}. Changes take effect after restart.`
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.engine.maxStackDepth))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.engine.maxStackDepth = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(this.containerEl)
			.setName("Max instructions")
			.setDesc(
				`Maximum number of opcodes executed per expression. Halts runaway infinite loops. Default is ${DEFAULT_SETTINGS.engine.vm.maxInstructions.toLocaleString()}. Changes take effect after restart.`
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.engine.maxInstructions))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.engine.maxInstructions = num;
							await this.plugin.saveSettings();
						}
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

				slider.onChange(async (value) => {
					this.plugin.settings.floatResult.decimalPlaces = value;

					await this.plugin.saveSettings();
				});
			});
	}

	displayPercentageSettings() {
		new Setting(this.containerEl).setName("Percentage Result").setHeading();

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

				slider.onChange(async (value) => {
					this.plugin.settings.percentageResult.decimalPlaces = value;

					await this.plugin.saveSettings();
				});
			});
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

				slider.onChange(async (value) => {
					this.plugin.settings.hexResult.paddingZeros = value;

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

				slider.onChange(async (value) => {
					this.plugin.settings.unitOfMeasurementResult.decimalPlaces =
						value;

					await this.plugin.saveSettings();
				});
			});
	}

	displaySyntaxHighlightSettings() {
		new Setting(this.containerEl).setName("Syntax highlighting").setHeading();
		new Setting(this.containerEl).setDesc(
			"Colors solve expressions in the editor by token type (numbers, operators, keywords, ...). These colors are also exposed as CSS variables (--solve-hl-*) if you use the Style Settings plugin for finer control."
		);

		new Setting(this.containerEl)
			.setName("Enable syntax highlighting")
			.setDesc(
				`Default is ${DEFAULT_SETTINGS.syntaxHighlight.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syntaxHighlight.enabled)
					.onChange(async (value) => {
						this.plugin.settings.syntaxHighlight.enabled = value;
						this.plugin.settings.syntaxHighlight.applyCssVariables();
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Color preset")
			.setDesc(
				"Sets the base color for every category below. Switching presets does not discard any individual colors you've already customized."
			)
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(SYNTAX_HIGHLIGHT_PRESET_LABELS)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(this.plugin.settings.syntaxHighlight.preset)
					.onChange(async (value) => {
						this.plugin.settings.syntaxHighlight.preset = value as SyntaxHighlightPresetName;
						this.plugin.settings.syntaxHighlight.applyCssVariables();
						await this.plugin.saveSettings();
						this.display(); // re-render so color pickers reflect the new preset
					});
			});

		for (const category of SOLVE_HIGHLIGHT_CATEGORIES) {
			new Setting(this.containerEl)
				.setName(CATEGORY_LABELS[category] ?? category)
				.addColorPicker((picker) =>
					picker
						.setValue(this.plugin.settings.syntaxHighlight.resolvedColor(category))
						.onChange(async (value) => {
							this.plugin.settings.syntaxHighlight.setOverride(category, value);
							this.plugin.settings.syntaxHighlight.applyCssVariables();
							await this.plugin.saveSettings();
						})
				)
				.addExtraButton((button) =>
					button
						.setIcon("rotate-ccw")
						.setTooltip("Reset to preset color")
						.onClick(async () => {
							this.plugin.settings.syntaxHighlight.setOverride(category, undefined);
							this.plugin.settings.syntaxHighlight.applyCssVariables();
							await this.plugin.saveSettings();
							this.display();
						})
				);
		}
	}

	displayCompletionSettings() {
		new Setting(this.containerEl).setName("Autocomplete").setHeading();
		new Setting(this.containerEl).setDesc(
			"Suggests keywords, functions, units, and variable names already used in the document as you type. Independent of syntax highlighting — either can be disabled without affecting the other."
		);

		new Setting(this.containerEl)
			.setName("Enable autocomplete")
			.setDesc(
				`Default is ${DEFAULT_SETTINGS.completions.enabled}`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.completions.enabled)
					.onChange(async (value) => {
						this.plugin.settings.completions.enabled = value;
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
