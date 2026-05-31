import { EPluginEvent } from "@app/constants/EPluginEvent";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import { EditorView, WidgetType } from "@codemirror/view";

export class ExpressionResultWidget extends WidgetType {
	expression: string;
	result: string;
	lineNumber: number;
	isInlineSolve: boolean;
	/** Whether this widget shows a pending/loading state for async results. */
	isPending: boolean;
	/** The query key for deduplication and debug display. */
	queryKey: string | null;

	constructor(
		lineNumber: number,
		isInlineSolve: boolean,
		expression: string,
		result: string,
		isPending = false,
		queryKey: string | null = null
	) {
		super();
		this.expression = expression;
		this.result = result;
		this.lineNumber = lineNumber;
		this.isInlineSolve = isInlineSolve;
		this.isPending = isPending;
		this.queryKey = queryKey;
	}

	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("div");
		div.id = `osr-${this.lineNumber}`;

		if (this.isPending) {
			// Loading indicator for async results
			div.classList.add("os-result", "os-result--pending");
			if (this.queryKey) {
				div.setAttribute("data-query-key", this.queryKey);
			}

			const spinner = document.createElement("span");
			spinner.classList.add("os-result__spinner");
			spinner.textContent = "⟳";

			const label = document.createElement("span");
			label.classList.add("os-result__pending-label");
			label.textContent = "...";

			div.appendChild(spinner);
			div.appendChild(label);
			return div;
		}

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