import { ResultType } from "@/constants/ResultType";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { INumericResult } from "@/visitors/results/INumericResult";

export class PercentageResult implements INumericResult {
	type = ResultType.Percentage;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitPercentageResult(this);
	}
}
