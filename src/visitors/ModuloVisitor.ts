import { percentageOf } from "@/utilities/Percentage";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { INumericResult } from "@/visitors/results/INumericResult";
import { IResult } from "@/visitors/results/IResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class ModuloVisitor implements IResultVisitor<INumericResult> {
	constructor(
		private left: INumericResult,
		private right: INumericResult
	) {}

	visitFloatResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			return new FloatResult(
				this.left.value %
					percentageOf(this.right.value, this.left.value)
			);
		}

		return new FloatResult(this.left.value % this.right.value);
	}

	visitIntegerResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			return new FloatResult(
				this.left.value %
					percentageOf(this.right.value, this.left.value)
			);
		}

		return new IntegerResult(
			Math.trunc(this.left.value % this.right.value)
		);
	}

	visitHexResult(result: IResult<number>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new Error("Unable to use percentage with left hex operand");
		}

		return new HexResult(Math.trunc(this.left.value % this.right.value));
	}

	visitPercentageResult(result: IResult<number>): INumericResult {
		return new FloatResult((this.left.value / 100) % this.right.value);
	}
}
