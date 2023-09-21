import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { AutoNumberResult } from "@/results/AutoNumberResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { increaseByPercentage } from "@/utilities/Percentage";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class IncreaseByVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (visited instanceof AutoNumberResult) {
			(visited as INumericResult).value = increaseByPercentage(
				visited.value,
				this.right.value
			);

			return visited;
		}

		throw new UnsupportedVisitorOperationError();
	}
}
