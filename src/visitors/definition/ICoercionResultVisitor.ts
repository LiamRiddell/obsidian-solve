import { IResult } from "@/results/definition/IResult";

export interface ICoercionResultVisitor<T extends IResult<unknown>> {
	visit(result: IResult<unknown>): T;
}
