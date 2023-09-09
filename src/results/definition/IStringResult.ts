import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface IStringResult extends IResult<string> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
