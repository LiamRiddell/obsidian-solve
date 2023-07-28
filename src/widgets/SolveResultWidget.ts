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

		div.setCssStyles({
			height: `${view.defaultLineHeight}px`,
			display: "inline-flex",
			background: "rgba(34, 206, 153, 0.2)",
			color: "22CE99",
			padding: "0 4px",
			borderRadius: "4px",
			marginRight: "4px",
		});

		return div;
	}
}
