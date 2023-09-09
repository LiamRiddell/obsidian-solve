import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";
import { Moment } from "moment";

export interface IDatetimeResult extends IResult<Moment> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
