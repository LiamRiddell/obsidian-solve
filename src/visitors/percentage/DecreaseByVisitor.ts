import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { INumericResult } from "@/results/INumericResult";
import { IResult } from "@/results/IResult";
import { PercentageResult } from "@/results/PercentageResult";
import { decreaseByPercentage } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class DecreaseByVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: PercentageResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		return new FloatResult(
			decreaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		return new FloatResult(
			decreaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		return new HexResult(
			decreaseByPercentage(this.left.value, this.right.value)
		);
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			decreaseByPercentage(this.left.value, this.right.value)
		);
	}
}
