import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { percentageOf } from "@/utilities/Percentage";
import { FloatCoercion } from "@/visitors/coercion/FloatCoercionVisitor";
import { HexCoercion } from "@/visitors/coercion/HexCoercionVisitor";
import { IntegerCoercion } from "@/visitors/coercion/IntegerCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class DivisionVisitor implements IGenericResultVisitor<INumericResult> {
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (visited instanceof FloatResult) {
			return this.float(visited, this.right);
		}

		if (visited instanceof IntegerResult) {
			return this.integer(visited, this.right);
		}

		if (visited instanceof HexResult) {
			return this.hex(visited, this.right);
		}

		if (visited instanceof PercentageResult) {
			return this.percentage(visited, this.right);
		}

		throw new UnsupportedVisitorOperationError();
	}

	private float(left: FloatResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new FloatResult(
				left.value / percentageOf(right.value, left.value)
			);
		}

		const coercedRight = FloatCoercion.visit(right);

		return new FloatResult(left.value / coercedRight.value);
	}

	private integer(left: IntegerResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new IntegerResult(
				left.value / percentageOf(right.value, left.value)
			);
		}

		const coercedRight = IntegerCoercion.visit(right);

		return new IntegerResult(left.value / coercedRight.value);
	}

	private hex(left: HexResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new HexResult(
				left.value / percentageOf(right.value, left.value)
			);
		}

		const coercedRight = HexCoercion.visit(right);

		return new HexResult(left.value / coercedRight.value);
	}

	private percentage(left: PercentageResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new FloatResult(left.value / 100 / right.value / 100);
		}

		const coercedRight = FloatCoercion.visit(right);

		return new FloatResult(left.value / 100 / coercedRight.value);
	}
}
