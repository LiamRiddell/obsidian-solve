import { EResultType } from "@/constants/EResultType";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";
import { Moment } from "moment";

export class DatetimeResult implements IDatetimeResult {
	type = EResultType.Datetime;
	value: Moment;

	constructor(value: Moment) {
		this.value = value;
	}

	accept<T>(visitor: IGenericResultVisitor<T>): T {
		return visitor.visit(this);
	}
}
