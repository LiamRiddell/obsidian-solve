import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { NumberResult } from "@/results/AutoNumberResult";
import { HexResult } from "@/results/HexResult";
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
