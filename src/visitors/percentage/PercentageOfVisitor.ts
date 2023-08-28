import { FloatResult } from "@/results/FloatResult";
import { INumericResult } from "@/results/INumericResult";
import { IResult } from "@/results/IResult";
import { PercentageResult } from "@/results/PercentageResult";
import { percentageOf } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class PercentageOfVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: PercentageResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		return new FloatResult(percentageOf(this.left.value, this.right.value));
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		return new FloatResult(percentageOf(this.left.value, this.right.value));
	}

	visitHexResult(result: IResult<number>): INumericResult {
		throw new Error("Percentage of hex not supported.");
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageOf(this.left.value, this.right.value)
		);
	}
}
