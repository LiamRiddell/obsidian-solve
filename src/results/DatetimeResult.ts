import { EResultType } from "@/constants/EResultType";
import { IDatetimeResult } from "@/results/IMomentResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { Moment } from "moment";

export class DatetimeResult implements IDatetimeResult {
	type = EResultType.Datetime;
	value: Moment;

	constructor(value: Moment) {
		this.value = value;
	}

	accept<T>(visitor: IResultVisitor<T>): T {
		return visitor.visitDatetimeResult(this);
	}
}
