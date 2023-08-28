import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { INumericResult } from "@/results/INumericResult";
import { IResult } from "@/results/IResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

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
