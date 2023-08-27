import { ResultType } from "@/constants/ResultType";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { INumericResult } from "@/visitors/results/INumericResult";

export class FloatResult implements INumericResult {
	type = ResultType.Number;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitFloatResult(this);
	}
}
