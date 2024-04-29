import { IVector2 } from "@/providers/vector/IVector2";
import { IVector2Result } from "@/results/definition/IVector2Result";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class Vector2Result implements IVector2Result {
	value: IVector2;

	constructor(value: IVector2) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
