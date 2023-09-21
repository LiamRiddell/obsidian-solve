import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { PercentageResult } from "@/results/PercentageResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { percentageOf } from "@/utilities/Percentage";
import { FloatCoercion } from "@/visitors/coercion/NumberCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class PercentageOfVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		if (visited instanceof PercentageResult) {
			const coercedRight = FloatCoercion.visit(this.right);

			this.right.value = percentageOf(visited.value, coercedRight.value);

			return this.right;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
