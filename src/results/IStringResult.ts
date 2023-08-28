import { IResult } from "@/results/IResult";
import { IResultVisitor } from "@/visitors/IResultVisitor";

export interface IStringResult extends IResult<string> {
	accept<T>(visitor: IResultVisitor<T>): T;
}
