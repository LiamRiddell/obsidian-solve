import { INumericResult } from "@/results/INumericResult";
import { IResult } from "@/results/IResult";
import { PercentageResult } from "@/results/PercentageResult";
import { percentageIncrease } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class PercentageIncreaseOrDecreaseVisitor
	implements IResultVisitor<INumericResult>
{
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageIncrease(this.left.value, this.right.value)
		);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageIncrease(this.left.value, this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageIncrease(this.left.value, this.right.value)
		);
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageIncrease(this.left.value, this.right.value)
		);
	}
}
