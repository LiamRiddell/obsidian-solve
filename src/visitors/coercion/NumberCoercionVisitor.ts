import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { AutoNumberResult } from "@/results/AutoNumberResult";
import { HexResult } from "@/results/HexResult";
import { IResult } from "@/results/definition/IResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class NumberCoercionVisitor
	implements ICoercionResultVisitor<AutoNumberResult>
{
	visit(visited: IResult<unknown>): AutoNumberResult {
		if (visited instanceof AutoNumberResult) {
			return visited;
		}

		if (
			visited instanceof AutoNumberResult ||
			visited instanceof HexResult
		) {
			return new AutoNumberResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const FloatCoercion = new NumberCoercionVisitor();
