import { MarkdownEditorViewPlugin } from "@app/codemirror/MarkdownEditorViewPlugin";
import { FeatureFlagClass } from "@app/constants/EFeatureFlagClass";
import { EPluginEvent } from "@app/constants/EPluginEvent";
import { EPluginStatus } from "@app/constants/EPluginStatus";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import { solve } from "@solve-js/api/SolveAPI";
import { EngineProvider } from "@app/engine/EngineProvider";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import { SettingTab } from "@app/settings/SettingsTab";
import UserSettings from "@app/settings/UserSettings";
import { minValueExcludingBelow } from "@app/utilities/Array";
import { logger } from "@app/utilities/Logger";
import { insertAtIndex } from "@app/utilities/String";
import { ViewPlugin } from "@codemirror/view";
import { Notice, Plugin } from "obsidian";

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

		await this.registerEditorExtensions();
		logger.debug(`[Solve] Registered: Editor Extensions`);

		await this.addStatusBarCompanion();
		logger.debug(`[Solve] Added: Status Bar Companion`);

		await this.registerCommands();

		pluginEventBus.emit(EPluginEvent.SolveEngineReady, solve);
		logger.debug(`[Solve] Fired: SolveEngineReady`);
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
			EPluginEvent.WriteResultToActiveDocumentLine,
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

	private async registerCommands() {
		// FIX #3: Evaluate expression command — uses shared engine
		this.addCommand({
			id: "evaluate-expression",
			name: "Evaluate expression",
			editorCallback(editor, ctx) {
				const engine = EngineProvider.get();
				const selectedText = editor.getSelection();

				if (!selectedText) {
					new Notice("Solve: Select an expression to evaluate.");
					return;
				}

				try {
					const val = engine.evaluateExpression(selectedText);
					new Notice(`Solve: ${selectedText.trim()} = ${val.toNumber()}`);
				} catch (err) {
					new Notice(`Solve: Error — ${(err as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: "commit-result-current-line",
			name: "Commit result on current line",
			editorCallback(editor, ctx) {
				const currentLineNumber = editor.getCursor("head").line + 1;

				// Use type assertion to access containerEl
				const containerEl = (editor as any).containerEl as HTMLElement;

				const resultElement = (
					containerEl
				).querySelector<HTMLElement>(`#osr-${currentLineNumber}`);

				if (resultElement) {
					resultElement.click();
				} else {
					new Notice(
						"Solve: Failed to commit, no result found on the current line."
					);
				}
			},
		});

		this.addCommand({
			id: "commit-result-all-visible",
			name: "Commit all visible results",
			editorCallback(editor, ctx) {
				// Use type assertion to access containerEl
				const containerEl = (editor as any).containerEl as HTMLElement;

				const resultElements = (
					containerEl
				).querySelectorAll<HTMLElement>(`.os-result`);

				for (let i = 0; i < resultElements.length; i++) {
					const resultElement = resultElements[i];

					if (resultElement) {
						resultElement.click();
					}
				}
			},
		});

		this.addCommand({
			id: "commit-result-selection-visible",
			name: "Commit results in selection",
			editorCallback(editor, ctx) {
				const selectionStart = editor.getCursor("from");
				const selectionEnd = editor.getCursor("to");

				if (
					selectionStart.line === selectionEnd.line &&
					selectionStart.ch === selectionEnd.ch
				) {
					new Notice("Solve: Failed to commit, no text selected.");
					return;
				}

				// Use type assertion to access containerEl
				const containerEl = (editor as any).containerEl as HTMLElement;

				if (!containerEl) {
					return;
				}

				for (
					let i = selectionStart.line + 1;
					i < selectionEnd.line + 1;
					i++
				) {
					const resultElement = (
						containerEl
					).querySelector<HTMLElement>(`#osr-${i + 1}`);

					if (resultElement) {
						resultElement.click();
					}
				}
			},
		});
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

	private async onWriteResultEvent(
		lineNumber: number,
		expression: string,
		result: string,
		isInlineSolve?: boolean
	) {
		const lineNumberZeroIndexed = Math.max(0, lineNumber - 1);

		let lineText = this.app.workspace.activeEditor?.editor?.getLine(
			lineNumberZeroIndexed
		);

		if (typeof lineText === "undefined") {
			return;
		}

		const commentsBeginIndex = minValueExcludingBelow([
			lineText.indexOf("#"),
			lineText.indexOf("//"),
		]);

		if (commentsBeginIndex > -1) {
			lineText = insertAtIndex(
				lineText,
				commentsBeginIndex,
				` ${result} ` // Whitespace normalised for format.. Expression Result Comment
			);
		} else if (isInlineSolve) {
			// Remove the equals from the result if the user does not want it.
			const shouldIncludeEquals =
				this.settings.inlineSolve.includeEqualsOnCommit &&
				!this.settings.inlineSolve.includeExpressionOnCommit;

			let resultString = result.toString();

			resultString = shouldIncludeEquals
				? resultString
				: resultString.replace(/^= /, "");

			// Build the replacement text, adding the source expression if required.
			let replacementText = this.settings.inlineSolve
				.includeExpressionOnCommit
				? `${expression} = ${resultString}`
				: `${resultString}`;

			// Add the backticks if requested.
			replacementText = this.settings.inlineSolve.includeBackticksOnCommit
				? `\`${replacementText}\``
				: replacementText;

			// Build the full line replacement.
			lineText = lineText.replace(`s\`${expression}\``, replacementText);
		} else {
			lineText = `${lineText?.trimEnd()} ${result}`;
		}

		this.app.workspace.activeEditor?.editor?.setLine(
			lineNumberZeroIndexed,
			lineText
		);
	}
}