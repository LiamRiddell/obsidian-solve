import { IResultVisitor } from "@/visitors/IResultVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class FormatVisitor implements IResultVisitor<string> {
	visitFloatResult(result: FloatResult): string {
		// TODO: Implement User Settings
		return result.value.toFixed(4);
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
