import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import UserSettings from "@/settings/UserSettings";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class FormatVisitor implements IResultVisitor<string> {
	private settings: UserSettings;

	constructor() {
		this.settings = UserSettings.getInstance();
		// TODO:
		// - Float Result, Percentage Result
	}

	visitFloatResult(result: FloatResult): string {
		// TODO: Implement User Settings
		return result.value.toFixed(this.settings.decimalPoints);
	}

	visitHexResult(result: HexResult): string {
		const isNegative = result.value < 0;
		const hexString = Math.abs(result.value).toString(16).toUpperCase();
		return isNegative ? `-0x${hexString}` : `0x${hexString}`;
	}

	visitIntegerResult(result: IntegerResult): string {
		return Math.trunc(result.value).toString();
	}

	visitPercentageResult(result: PercentageResult): string {
		// TODO: Implement User Settings
		return `${result.value.toFixed(4)}%`;
	}
}
