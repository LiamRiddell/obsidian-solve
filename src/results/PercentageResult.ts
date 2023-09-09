import { EResultType } from "@/constants/EResultType";
import { INumericResult } from "@/results/definition/INumericResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class PercentageResult implements INumericResult {
	type = EResultType.Percentage;
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
