import { EResultType } from "@/constants/EResultType";
import { IStringResult } from "@/results/definition/IStringResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class StringResult implements IStringResult {
	type = EResultType.String;
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
