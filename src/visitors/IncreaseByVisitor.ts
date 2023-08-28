import { increaseByPercentage } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { INumericResult } from "@/visitors/results/INumericResult";
import { IResult } from "@/visitors/results/IResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class IncreaseByVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: PercentageResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		return new FloatResult(
			increaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		return new FloatResult(
			increaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		return new HexResult(
			increaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			increaseByPercentage(this.left.value, this.right.value)
		);
	}
}
