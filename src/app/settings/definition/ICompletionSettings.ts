export interface ICompletionSettings {
	/**
	 * Independent of syntaxHighlight.enabled by design — a user can run with
	 * completions on and highlighting off, or vice versa, or both off for
	 * raw performance. No visual/color config here (unlike syntax
	 * highlighting): completions have no per-category styling, only CM6's
	 * own default tooltip appearance.
	 */
	enabled: boolean;
}
