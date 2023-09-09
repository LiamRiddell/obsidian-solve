import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { IVector3Result } from "@/results/definition/IVector3Result";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { Vector3Result } from "@/results/Vector3Result";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class Vector3CoercionVisitor
	implements ICoercionResultVisitor<IVector3Result>
{
	visit(visited: IResult<unknown>): IVector3Result {
		if (visited instanceof Vector3Result) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult
		) {
			return new Vector3Result({
				x: visited.value,
				y: visited.value,
				z: visited.value,
			});
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const Vector3Coercion = new Vector3CoercionVisitor();
