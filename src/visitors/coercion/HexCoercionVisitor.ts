import { UnsupportedCoercionOperationError } from "@/errors/UnsupportedCoercionOperationError";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { IResult } from "@/results/definition/IResult";
import { ICoercionResultVisitor } from "@/visitors/definition/ICoercionResultVisitor";

export class HexCoercionVisitor implements ICoercionResultVisitor<HexResult> {
	visit(visited: IResult<unknown>): HexResult {
		if (visited instanceof HexResult) {
			return visited;
		}

		if (
			visited instanceof NumberResult ||
			visited instanceof HexResult ||
			visited instanceof PercentageResult
		) {
			return new HexResult(visited.value);
		}

		throw new UnsupportedCoercionOperationError();
	}
}

export const HexCoercion = new HexCoercionVisitor();
