import { IVector2 } from "@/providers/vector/IVector2";
import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface IVector2Result extends IResult<IVector2> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
