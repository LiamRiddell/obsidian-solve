import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class LogicalShiftLeftVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new FloatResult(this.left.value << this.right.value);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new IntegerResult(
			Math.trunc(this.left.value << this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new HexResult(Math.trunc(this.left.value << this.right.value));
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new PercentageResult(this.left.value << this.right.value);
	}

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}

	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}

export class LogicalShiftRightVisitor
	implements IResultVisitor<INumericResult>
{
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new FloatResult(this.left.value >> this.right.value);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new IntegerResult(
			Math.trunc(this.left.value >> this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new HexResult(Math.trunc(this.left.value >> this.right.value));
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		return new PercentageResult(this.left.value >> this.right.value);
	}

	visitDatetimeResult(result: IDatetimeResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}

	visitStringResult(result: IStringResult): INumericResult {
		throw new UnsupportedVisitorOperationError();
	}
}
