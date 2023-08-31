import { EResultType } from "@/constants/EResultType";
import { IStringResult } from "@/results/definition/IStringResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export class StringResult implements IStringResult {
	type = EResultType.String;
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitStringResult(this);
	}
}
