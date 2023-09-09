import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { FloatResult } from "@/results/FloatResult";
import { IntegerResult } from "@/results/IntegerResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { increaseByPercentage } from "@/utilities/Percentage";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class IncreaseByVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult
		) {
			(visited as INumericResult).value = increaseByPercentage(
				visited.value,
				this.right.value
			);

			return visited;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
