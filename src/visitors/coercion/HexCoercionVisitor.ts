import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class HexCoercionVisitor implements ICoercionResultVisitor<HexResult> {
	visit(visited: IResult<unknown>): HexResult {
		if (visited instanceof HexResult) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult ||
			visited instanceof UnitOfMeasurementResult
		) {
			return new HexResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const HexCoercion = new HexCoercionVisitor();
