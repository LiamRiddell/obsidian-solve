import { IStringResult } from "@/results/definition/IStringResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class StringResult implements IStringResult {
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
