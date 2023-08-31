import { EResultType } from "@/constants/EResultType";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class PercentageResult implements INumericResult {
	type = EResultType.Percentage;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitPercentageResult(this);
	}
}
