import { IDatetimeResult } from "@/results/IMomentResult";
import { INumericResult } from "@/results/INumericResult";
import { IStringResult } from "@/results/IStringResult";

export interface IResultVisitor<T> {
	visitFloatResult(result: INumericResult): T;
	visitIntegerResult(result: INumericResult): T;
	visitPercentageResult(result: INumericResult): T;
	visitHexResult(result: INumericResult): T;
	visitDatetimeResult(result: IDatetimeResult): T;
	visitStringResult(result: IStringResult): T;
}
