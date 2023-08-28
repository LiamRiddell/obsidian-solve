import { IResultVisitor } from "@/visitors/IResultVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { INumericResult } from "@/visitors/results/INumericResult";
import { IResult } from "@/visitors/results/IResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class LogicalShiftLeftVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new FloatResult(this.left.value << this.right.value);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new IntegerResult(
			Math.trunc(this.left.value << this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new HexResult(Math.trunc(this.left.value << this.right.value));
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new PercentageResult(this.left.value << this.right.value);
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
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new FloatResult(this.left.value >> this.right.value);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new IntegerResult(
			Math.trunc(this.left.value >> this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new HexResult(Math.trunc(this.left.value >> this.right.value));
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error(
				"Unable to use percentage with logical left shift operator"
			);
		}

		return new PercentageResult(this.left.value >> this.right.value);
	}
}
