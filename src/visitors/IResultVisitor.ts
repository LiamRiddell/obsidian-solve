import { IResult } from "@/results/IResult";

export interface IResultVisitor<T> {
	visitFloatResult(result: IResult<number>): T;
	visitIntegerResult(result: IResult<number>): T;
	visitHexResult(result: IResult<number>): T;
	visitPercentageResult(result: IResult<number>): T;
}
