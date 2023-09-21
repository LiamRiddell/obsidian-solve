import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { NumberResult } from "@/results/AutoNumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { percentageIncrease } from "@/utilities/Percentage";
import { NumberCoercion } from "@/visitors/coercion/NumberCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class PercentageIncreaseOrDecreaseVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		if (visited instanceof NumberResult) {
			const coercedRight = NumberCoercion.visit(this.right);

			return new PercentageResult(
				percentageIncrease(visited.value, coercedRight.value)
			);
		}

		throw new UnsupportedVisitorOperationError();
	}
}
