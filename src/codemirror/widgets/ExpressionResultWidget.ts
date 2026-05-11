import { EPluginEvent } from "@/constants/EPluginEvent";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import UserSettings from "@/settings/UserSettings";
import { EditorView, WidgetType } from "@codemirror/view";

// Optimise: Remove reliance on user settings
export class ExpressionResultWidget extends WidgetType {
	userSettings: UserSettings;
	expression: string;
	result: string;
	lineNumber: number;
	isInlineSolve: boolean;

	constructor(
		lineNumber: number,
		isInlineSolve: boolean,
		expression: string,
		result: string
	) {
		super();
		this.userSettings = UserSettings.getInstance();
		this.expression = expression;
		this.result = result;
		this.lineNumber = lineNumber;
		this.isInlineSolve = isInlineSolve;
	}

	toDOM(view: EditorView): HTMLElement {
		const activeLineNumber = view.state.doc.lineAt(
			view.state.selection.main.head
		).number;

		const div = document.createElement("div");
		div.id = `osr-${this.lineNumber}`;
		div.title = "Click to commit this result";

		div.addEventListener("click", () => {
			pluginEventBus.emit(
				EPluginEvent.WriteResultToActiveDocumentLine,
				this.lineNumber,
				this.expression,
				this.result,
				this.isInlineSolve
			);
		});

		if (this.userSettings.interface.animateResults) {
			div.style.setProperty(
				"--animate-duration",
				this.userSettings.interface.animationDuration
			);
		}

		div.classList.add("os-result");

		if (
			this.userSettings.interface.animateResults &&
			this.lineNumber === activeLineNumber
		) {
			div.classList.add(
				...[
					"animate__animated",
					this.userSettings.interface.animationClass,
				]
			);
		}

		div.textContent = `${this.result}`;

		return div;
	}
}
