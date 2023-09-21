import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { NumberResult } from "@/results/AutoNumberResult";
import { IResult } from "@/results/definition/IResult";
import { HexResult } from "@/results/HexResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class HexCoercionVisitor implements ICoercionResultVisitor<HexResult> {
	visit(visited: IResult<unknown>): HexResult {
		if (visited instanceof HexResult) {
			return visited;
		}

		if (visited instanceof NumberResult || visited instanceof HexResult) {
			return new HexResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const HexCoercion = new HexCoercionVisitor();
