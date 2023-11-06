import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { IResult } from "@/results/definition/IResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class NumberCoercionVisitor
	implements ICoercionResultVisitor<NumberResult>
{
	visit(visited: IResult<unknown>): NumberResult {
		if (visited instanceof NumberResult) {
			return visited;
		}

		if (
			visited instanceof HexResult ||
			visited instanceof UnitOfMeasurementResult
		) {
			return new NumberResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const NumberCoercion = new NumberCoercionVisitor();
