import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
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
		throw new UnsupportedVisitorOperationError();
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new PercentageResult(
			percentageOf(this.left.value, this.right.value)
		);
	}

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}

	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}
