import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { IntegerResult } from "@/results/IntegerResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { decreaseByPercentage } from "@/utilities/Percentage";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class DecreaseByVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult
		) {
			this.right.value = decreaseByPercentage(
				visited.value,
				this.right.value
			);

			return this.right;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
