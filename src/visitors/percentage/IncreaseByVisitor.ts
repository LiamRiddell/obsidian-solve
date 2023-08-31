import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
import { increaseByPercentage } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";

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

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}

	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}
