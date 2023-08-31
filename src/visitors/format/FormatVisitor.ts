import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IDatetimeResult } from "@/results/IMomentResult";
import { IStringResult } from "@/results/IStringResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import UserSettings from "@/settings/UserSettings";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class FormatVisitor implements IResultVisitor<string> {
	private settings: UserSettings;

	constructor() {
		this.settings = UserSettings.getInstance();
	}

	visitFloatResult(result: FloatResult): string {
		return result.value.toFixed(this.settings.floatResult.decimalPlaces);
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
		return `${result.value.toFixed(
			this.settings.percentageResult.decimalPlaces
		)}%`;
	}

	visitDatetimeResult(result: IDatetimeResult): string {
		return result.value.format(this.settings.datetimeResult.format);
	}

	visitStringResult(result: IStringResult): string {
		return result.value;
	}
}
