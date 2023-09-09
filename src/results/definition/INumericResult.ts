import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface INumericResult extends IResult<number> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
