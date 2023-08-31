import { IResult } from "@/results/definition/IResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export interface INumericResult extends IResult<number> {
	accept<T>(visitor: IResultVisitor<T>): T;
}
