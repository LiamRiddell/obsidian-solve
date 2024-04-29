import { INumericResult } from "@/results/definition/INumericResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class UnitOfMeasurementResult implements INumericResult {
	value: number;
	unit: string;

	constructor(value: number, unit: string) {
		this.value = value;
		this.unit = unit;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
