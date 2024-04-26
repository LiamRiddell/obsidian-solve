import { IBigIntResult } from "@/results/definition/IBigIntResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class BigIntResult implements IBigIntResult {
	value: bigint;
	radix: number;

	constructor(value: bigint, radix: number) {
		this.value = value;
		this.radix = radix;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
