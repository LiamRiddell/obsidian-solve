import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IStringResult } from "@/results/definition/IStringResult";

export interface IResultVisitor<T> {
	visitNumberResult(result: INumericResult): T;
	visitPercentageResult(result: INumericResult): T;
	visitHexResult(result: INumericResult): T;
	visitDatetimeResult(result: IDatetimeResult): T;
	visitStringResult(result: IStringResult): T;
}
