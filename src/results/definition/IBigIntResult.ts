import { IResult } from "@/results/definition/IResult";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export interface IBigIntResult extends IResult<bigint> {
	accept<T>(visitor: IGenericResultVisitor<T>): T;
}
