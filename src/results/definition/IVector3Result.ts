import { IVector3 } from "@/providers/vector/IVector3";
import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface IVector3Result extends IResult<IVector3> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
