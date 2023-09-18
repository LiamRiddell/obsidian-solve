import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class FloatCoercionVisitor
	implements ICoercionResultVisitor<FloatResult>
{
	visit(visited: IResult<unknown>): FloatResult {
		if (visited instanceof FloatResult) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult ||
			visited instanceof UnitOfMeasurementResult
		) {
			return new FloatResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const FloatCoercion = new FloatCoercionVisitor();
