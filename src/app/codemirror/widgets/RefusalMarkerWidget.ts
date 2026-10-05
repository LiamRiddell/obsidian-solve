import { WidgetType } from "@codemirror/view";

/**
 * A muted marker beside a line Solve declined to calculate, with the reason
 * on hover and on keyboard focus (#96).
 *
 * Most lines in a note are prose, and the engine answers each with the
 * generic code `eval_failed`, which shows nothing, so prose stays blank. A
 * named refusal is different: `5 kg to m` answers `INCOMPATIBLE_UNITS`, a mass
 * cannot be converted to a length, and `12/25/2026` answers
 * `DATE_ORDER_MISMATCH`. Hidden, a refusal looked exactly like a line the
 * engine ignored; the marker tells the reader Solve read the line, declined,
 * and why.
 *
 * The reason is the marker's accessible name and a tooltip shown on pointer
 * hover and on keyboard focus alike, never pointer-only (#98).
 */
export class RefusalMarkerWidget extends WidgetType {
	constructor(
		readonly lineNumber: number,
		readonly code: string,
		readonly message: string
	) {
		super();
	}

	eq(other: RefusalMarkerWidget): boolean {
		return this.lineNumber === other.lineNumber && this.code === other.code && this.message === other.message;
	}

	toDOM(): HTMLElement {
		const marker = document.createElement("span");
		marker.classList.add("os-refusal");
		marker.dataset.osrLine = String(this.lineNumber);
		marker.dataset.code = this.code;
		marker.tabIndex = 0;
		marker.setAttribute("role", "note");
		marker.setAttribute("aria-label", `Solve did not calculate this line: ${this.message}`);

		const glyph = document.createElement("span");
		glyph.classList.add("os-refusal__glyph");
		glyph.setAttribute("aria-hidden", "true");
		glyph.textContent = "?";

		// Text content, never markup: the message is the engine's sentence,
		// and may quote what the reader typed.
		const tooltip = document.createElement("span");
		tooltip.classList.add("os-refusal__message");
		tooltip.setAttribute("aria-hidden", "true");
		tooltip.textContent = this.message;

		marker.append(glyph, tooltip);
		return marker;
	}
}

/**
 * The code a line's Error result carries when it is a named refusal worth a
 * marker, or `null` when it is not: no code, or `eval_failed`, the generic
 * code the engine gives a line it could not read at all (prose, a half-typed
 * expression). Keyed on the code rather than on whether the line compiles,
 * since a single word of prose (`Notes`, `TODO`) compiles as a variable.
 *
 * @param errorCode - The Error result's code.
 * @returns The code to show, or `null`.
 */
export function refusalCode(errorCode: string | undefined | null): string | null {
	if (typeof errorCode !== "string" || errorCode === "" || errorCode === "eval_failed") return null;
	return errorCode;
}
