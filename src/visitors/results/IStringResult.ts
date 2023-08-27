import { IResultVisitor } from "@/visitors/IResultVisitor";
import { IResult } from "@/visitors/results/IResult";

export interface IStringResult extends IResult<string> {
	accept<T>(visitor: IResultVisitor<T>): T;
}
