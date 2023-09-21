import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { NumberResult } from "@/results/AutoNumberResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { decreaseByPercentage } from "@/utilities/Percentage";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class DecreaseByVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (visited instanceof NumberResult) {
			(visited as INumericResult).value = decreaseByPercentage(
				visited.value,
				this.right.value
			);

			return visited;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
