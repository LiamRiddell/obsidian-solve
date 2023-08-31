import { IResult } from "@/results/IResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";
import { Moment } from "moment";

export interface IDatetimeResult extends IResult<Moment> {
	accept<T>(visitor: IResultVisitor<T>): T;
}
