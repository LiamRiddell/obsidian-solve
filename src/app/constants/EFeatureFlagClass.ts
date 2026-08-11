/**
 * CSS class names used as feature-flag toggles on `document.body`.
 *
 * Adding a flag to `document.body.classList` enables a corresponding visual
 * behaviour (e.g., positioning results at the end of the line). Removing it
 * disables the behaviour.
 */
export enum FeatureFlagClass {
	/** Results are positioned at the end of the line rather than after the text. */
	RenderEndOfLineResult = "osf--result-eol",
}
