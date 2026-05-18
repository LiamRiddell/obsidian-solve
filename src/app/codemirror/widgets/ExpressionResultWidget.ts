import { EPluginEvent } from "@app/constants/EPluginEvent";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import { EditorView, WidgetType } from "@codemirror/view";

export class ExpressionResultWidget extends WidgetType {
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
		this.expression = expression;
		this.result = result;
		this.lineNumber = lineNumber;
		this.isInlineSolve = isInlineSolve;
	}

	toDOM(view: EditorView): HTMLElement {
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

		div.classList.add("os-result");
		div.textContent = `${this.result}`;

		return div;
	}
}