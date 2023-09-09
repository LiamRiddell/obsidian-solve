import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { IVector2Result } from "@/results/definition/IVector2Result";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { Vector2Result } from "@/results/Vector2Result";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class Vector2CoercionVisitor
	implements ICoercionResultVisitor<IVector2Result>
{
	visit(visited: IResult<unknown>): IVector2Result {
		if (visited instanceof Vector2Result) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult
		) {
			return new Vector2Result({
				x: visited.value,
				y: visited.value,
			});
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const Vector2Coercion = new Vector2CoercionVisitor();
