import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { percentageIncrease } from "@/utilities/Percentage";
import { FloatCoercion } from "@/visitors/coercion/FloatCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class PercentageIncreaseOrDecreaseVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult
		) {
			const coercedRight = FloatCoercion.visit(this.right);

			this.right.value = percentageIncrease(
				visited.value,
				coercedRight.value
			);

			return this.right;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
