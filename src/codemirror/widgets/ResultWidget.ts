import { EditorView, WidgetType } from "@codemirror/view";

export class ResultWidget extends WidgetType {
	value: string;

	constructor(value: string) {
		super();
		this.value = value;
	}

	toDOM(view: EditorView): HTMLElement {
		const div = document.createElement("div");

		div.classList.add("os-result");

		div.textContent = `${this.value}`;

		return div;
	}
}
