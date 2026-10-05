export interface IInterfaceSettings {
	renderResultEndOfLine: boolean;
	/** Show a muted marker, with the reason, beside a line Solve declined to calculate (#96). */
	showRefusals: boolean;
	showStatusBarCompanion: boolean;

	animateResults: boolean;
	animationClass: string;
	animationDuration: string;
}
