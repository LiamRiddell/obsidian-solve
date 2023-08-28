import { EResultType } from "@/constants/EResultType";
import { INumericResult } from "@/results/INumericResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class FloatResult implements INumericResult {
	type = EResultType.Number;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitFloatResult(this);
	}
}
