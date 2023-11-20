import { EPluginEvent } from "@/constants/EPluginEvent";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import UserSettings from "@/settings/UserSettings";
import { EditorView, WidgetType } from "@codemirror/view";

export class ResultWidget extends WidgetType {
	value: string;
	lineNumber: number;
	userSettings: UserSettings;

	constructor(value: string, lineNumber: number) {
		super();
		this.value = value;
		this.lineNumber = lineNumber;
		this.userSettings = UserSettings.getInstance();
	}

	toDOM(view: EditorView): HTMLElement {
		const activeLineNumber = view.state.doc.lineAt(
			view.state.selection.main.head
		).number;

		const div = document.createElement("div");
		div.title = "Click to commit this result";

		div.addEventListener("click", () => {
			pluginEventBus.emit(
				EPluginEvent.WriteResultToActiveDocumentLine,
				this.lineNumber,
				this.value
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

		div.textContent = `${this.value}`;

		return div;
	}
}
