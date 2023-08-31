import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { PercentageResult } from "@/results/PercentageResult";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
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

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}
