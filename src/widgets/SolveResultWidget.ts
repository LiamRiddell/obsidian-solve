import { EditorView, WidgetType } from "@codemirror/view";

export class SolveResultWidget extends WidgetType {
	value: string;

	constructor(value: string) {
		super();
		this.value = value;
	}

	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("div");

		div.textContent = `= ${this.value}`;

		div.classList.add("os-result");

		return div;
	}
}
