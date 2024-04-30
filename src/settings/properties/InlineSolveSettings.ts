import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import UserSettings from "@/settings/UserSettings";

export class InlineSolveSettings {
	constructor(private parent: UserSettings) {}

	get includeExpressionOnCommit(): boolean {
		return (
			this.parent.settings.inlineSolve.includeExpressionOnCommit ??
			DEFAULT_SETTINGS.inlineSolve.includeExpressionOnCommit
		);
	}

	set includeExpressionOnCommit(value: boolean) {
		this.parent.settings.inlineSolve.includeExpressionOnCommit = value;
	}

	get includeBackticksOnCommit(): boolean {
		return (
			this.parent.settings.inlineSolve.includeBackticksOnCommit ??
			DEFAULT_SETTINGS.inlineSolve.includeBackticksOnCommit
		)
	}

	set includeBackticksOnCommit(value: boolean) {
		this.parent.settings.inlineSolve.includeBackticksOnCommit = value;
	}

	get includeEqualsOnCommit(): boolean {
		return (
			this.parent.settings.inlineSolve.includeEqualsOnCommit ??
			DEFAULT_SETTINGS.inlineSolve.includeEqualsOnCommit
		)
	}

	set includeEqualsOnCommit(value: boolean) {
		this.parent.settings.inlineSolve.includeEqualsOnCommit = value;
	}
}
