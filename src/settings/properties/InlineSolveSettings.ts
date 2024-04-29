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
}
