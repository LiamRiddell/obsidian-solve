import { EPluginEvent } from "@app/constants/EPluginEvent";
import { pluginEventBus } from "@app/eventbus/PluginEventBus";
import { EditorView, WidgetType } from "@codemirror/view";

/** Animate.css class name + `--animate-duration` to apply on a fresh (non-pending) result. `enabled: false` applies neither. */
export interface ResultAnimationOptions {
	enabled: boolean;
	className: string;
	duration: string;
}

const NO_ANIMATION: ResultAnimationOptions = { enabled: false, className: "", duration: "0s" };

export class ExpressionResultWidget extends WidgetType {
	expression: string;
	result: string;
	lineNumber: number;
	isInlineSolve: boolean;
	/** Whether this widget shows a pending/loading state for async results. */
	isPending: boolean;
	/** The query key for deduplication and debug display. */
	queryKey: string | null;
	private animation: ResultAnimationOptions;

	constructor(
		lineNumber: number,
		isInlineSolve: boolean,
		expression: string,
		result: string,
		isPending = false,
		queryKey: string | null = null,
		animation: ResultAnimationOptions = NO_ANIMATION
	) {
		super();
		this.expression = expression;
		this.result = result;
		this.lineNumber = lineNumber;
		this.isInlineSolve = isInlineSolve;
		this.isPending = isPending;
		this.queryKey = queryKey;
		this.animation = animation;
	}

	/**
	 * Widget equality — lets CodeMirror reuse the existing DOM node when the
	 * decoration is rebuilt with identical content. Without this, every
	 * decoration rebuild recreates every result widget's DOM.
	 */
	eq(other: ExpressionResultWidget): boolean {
		return (
			this.lineNumber === other.lineNumber &&
			this.isInlineSolve === other.isInlineSolve &&
			this.expression === other.expression &&
			this.result === other.result &&
			this.isPending === other.isPending &&
			this.queryKey === other.queryKey
		);
	}

	toDOM(view: EditorView): HTMLElement {
		if (this.isPending) {
			// Loading indicator for async results. A status with a name, so a
			// screen reader says what it is waiting for; the glyphs are
			// decoration and hidden from it (#98).
			const pending = document.createElement("span");
			pending.dataset.osrLine = String(this.lineNumber);
			pending.classList.add("os-result", "os-result--pending");
			pending.setAttribute("role", "status");
			pending.setAttribute("aria-label", "Waiting for live data");
			if (this.queryKey) {
				pending.setAttribute("data-query-key", this.queryKey);
			}

			const spinner = document.createElement("span");
			spinner.classList.add("os-result__spinner");
			spinner.setAttribute("aria-hidden", "true");
			spinner.textContent = "⟳";

			const label = document.createElement("span");
			label.classList.add("os-result__pending-label");
			label.setAttribute("aria-hidden", "true");
			label.textContent = "...";

			pending.appendChild(spinner);
			pending.appendChild(label);
			return pending;
		}

		// A button, so the result can be reached and activated from the
		// keyboard (Enter and Space, natively) and a screen reader announces
		// it as a control with a name, not as text (#98).
		const div = document.createElement("button");
		div.type = "button";
		// data attribute, not an id: ids must be document-unique, but the
		// same line number renders in every split pane showing this note.
		div.dataset.osrLine = String(this.lineNumber);
		const shown = this.result.replace(/^=\s*/, "");
		div.setAttribute("aria-label", `Commit result ${shown}`);
		div.title = "Commit this result into the line";

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

		// toDOM() only runs when eq() says this widget's content is genuinely
		// new (CodeMirror reuses the existing node otherwise) — exactly the
		// "this value just changed" moment an animation should mark, not a
		// per-keystroke re-render.
		if (this.animation.enabled && this.animation.className) {
			div.classList.add(this.animation.className);
			div.style.setProperty("--animate-duration", this.animation.duration);
		}

		return div;
	}
}