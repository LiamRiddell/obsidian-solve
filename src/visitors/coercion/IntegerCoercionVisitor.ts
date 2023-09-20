import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class IntegerCoercionVisitor
	implements ICoercionResultVisitor<IntegerResult>
{
	visit(visited: IResult<unknown>): IntegerResult {
		if (visited instanceof IntegerResult) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult ||
			visited instanceof UnitOfMeasurementResult
		) {
			return new IntegerResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const IntegerCoercion = new IntegerCoercionVisitor();
