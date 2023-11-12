import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class InterfaceSettings {
	constructor(private parent: UserSettings) {}

	get renderResultEndOfLine(): boolean {
		return (
			this.parent.settings.interface.renderResultEndOfLine ??
			DEFAULT_SETTINGS.interface.renderResultEndOfLine
		);
	}
	set renderResultEndOfLine(value: boolean) {
		this.parent.settings.interface.renderResultEndOfLine = value;
	}

	get showStatusBarCompanion(): boolean {
		return (
			this.parent.settings.interface.showStatusBarCompanion ??
			DEFAULT_SETTINGS.interface.showStatusBarCompanion
		);
	}
	set showStatusBarCompanion(value: boolean) {
		this.parent.settings.interface.showStatusBarCompanion = value;
	}

	get animateResults(): boolean {
		return (
			this.parent.settings.interface.animateResults ??
			DEFAULT_SETTINGS.interface.animateResults
		);
	}
	set animateResults(value: boolean) {
		this.parent.settings.interface.animateResults = value;
	}

	get animationClass(): string {
		return (
			this.parent.settings.interface.animationClass ??
			DEFAULT_SETTINGS.interface.animationClass
		);
	}
	set animationClass(value: string) {
		this.parent.settings.interface.animationClass = value;
	}

	get animationDuration(): string {
		return (
			this.parent.settings.interface.animationDuration ??
			DEFAULT_SETTINGS.interface.animationDuration
		);
	}
	set animationDuration(value: string) {
		this.parent.settings.interface.animationDuration = value;
	}
}
