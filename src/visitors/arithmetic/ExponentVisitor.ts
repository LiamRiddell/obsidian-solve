import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
import { percentageOf } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class ExponentVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			return new FloatResult(
				Math.pow(
					this.left.value,
					percentageOf(this.right.value, this.left.value)
				)
			);
		}

		return new FloatResult(Math.pow(this.left.value, this.right.value));
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			return new FloatResult(
				Math.pow(
					this.left.value,
					percentageOf(this.right.value, this.left.value)
				)
			);
		}

		return new IntegerResult(
			Math.trunc(Math.pow(this.left.value, this.right.value))
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new HexResult(
			Math.trunc(Math.pow(this.left.value, this.right.value))
		);
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new FloatResult(
			Math.pow(this.left.value / 100, this.right.value)
		);
	}

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}

	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}
