import { IVector4 } from "@/providers/vector/IVector4";
import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface IVector4Result extends IResult<IVector4> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
