import { EResultType } from "@/constants/EResultType";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class HexResult implements INumericResult {
	type = EResultType.Hex;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitHexResult(this);
	}
}
