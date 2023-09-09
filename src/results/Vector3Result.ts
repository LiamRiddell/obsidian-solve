import { EResultType } from "@/constants/EResultType";
import { IVector3 } from "@/providers/vector/IVector3";
import { IVector3Result } from "@/results/definition/IVector3Result";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class Vector3Result implements IVector3Result {
	type = EResultType.Vector3;
	value: IVector3;

	constructor(value: IVector3) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
