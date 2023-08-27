import { IResultVisitor } from "@/visitors/IResultVisitor";
import { IResult } from "@/visitors/results/IResult";

export interface INumericResult extends IResult<number> {
	accept<T>(visitor: IResultVisitor<T>): T;
}
