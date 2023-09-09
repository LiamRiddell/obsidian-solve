import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { IResult } from "@/results/definition/IResult";
import { IVector4Result } from "@/results/definition/IVector4Result";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { Vector4Result } from "@/results/Vector4Result";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class Vector4CoercionVisitor
	implements ICoercionResultVisitor<IVector4Result>
{
	visit(visited: IResult<unknown>): IVector4Result {
		if (visited instanceof Vector4Result) {
			return visited;
		}

		if (
			visited instanceof FloatResult ||
			visited instanceof IntegerResult ||
			visited instanceof HexResult
		) {
			return new Vector4Result({
				x: visited.value,
				y: visited.value,
				z: visited.value,
				w: visited.value,
			});
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const Vector4Coercion = new Vector4CoercionVisitor();
