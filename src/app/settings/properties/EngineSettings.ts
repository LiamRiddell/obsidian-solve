import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import UserSettings from "@app/settings/UserSettings";

export class EngineSettings {
	constructor(private parent: UserSettings) {}

	get explicitMode(): boolean {
		return (
			this.parent.settings.engine.explicitMode ??
			DEFAULT_SETTINGS.engine.explicitMode
		);
	}

	set explicitMode(value: boolean) {
		this.parent.settings.engine.explicitMode = value;
	}

	get maxExpressionLength(): number {
		return (
			this.parent.settings.engine.validation?.maxExpressionLength ??
			DEFAULT_SETTINGS.engine.validation.maxExpressionLength
		);
	}

	set maxExpressionLength(value: number) {
		this.parent.settings.engine.validation.maxExpressionLength = value;
	}

	get maxComplexity(): number {
		return (
			this.parent.settings.engine.validation?.maxComplexity ??
			DEFAULT_SETTINGS.engine.validation.maxComplexity
		);
	}

	set maxComplexity(value: number) {
		this.parent.settings.engine.validation.maxComplexity = value;
	}

	get maxNestingDepth(): number {
		return (
			this.parent.settings.engine.validation?.maxNestingDepth ??
			DEFAULT_SETTINGS.engine.validation.maxNestingDepth
		);
	}

	set maxNestingDepth(value: number) {
		this.parent.settings.engine.validation.maxNestingDepth = value;
	}

	// ── VM limits ──────────────────────────────────────────────────────────

	get maxStackDepth(): number {
		return (
			this.parent.settings.engine.vm?.maxStackDepth ??
			DEFAULT_SETTINGS.engine.vm.maxStackDepth
		);
	}

	set maxStackDepth(value: number) {
		this.parent.settings.engine.vm.maxStackDepth = value;
	}

	get maxInstructions(): number {
		return (
			this.parent.settings.engine.vm?.maxInstructions ??
			DEFAULT_SETTINGS.engine.vm.maxInstructions
		);
	}

	set maxInstructions(value: number) {
		this.parent.settings.engine.vm.maxInstructions = value;
	}
}
