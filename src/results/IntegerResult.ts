import { EResultType } from "@/constants/EResultType";
import { INumericResult } from "@/results/definition/INumericResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class IntegerResult implements INumericResult {
	type = EResultType.Number;
	value: number;

	constructor(value: number) {
		this.value = Math.trunc(value);
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
