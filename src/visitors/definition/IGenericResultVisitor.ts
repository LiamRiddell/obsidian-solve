import { IResult } from "@/results/definition/IResult";

export interface IGenericResultVisitor<T> {
	visit<TValue>(visited: IResult<TValue>): T;
}
