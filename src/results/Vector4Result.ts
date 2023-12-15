import { IVector4 } from "@/providers/vector/IVector4";
import { IVector4Result } from "@/results/definition/IVector4Result";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class Vector4Result implements IVector4Result {
	value: IVector4;

	constructor(value: IVector4) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
