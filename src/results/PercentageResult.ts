import { INumericResult } from "@/results/definition/INumericResult";
import { logger } from "@/utilities/Logger";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class PercentageResult implements INumericResult {
	value: number;

	constructor(value: number) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		logger.debug("[PercentageResult] accept", visitor);
		return visitor.visit(this);
	}
}
