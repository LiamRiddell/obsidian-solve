import { IResult } from "@/results/definition/IResult";

export interface IProvider {
	name: string;
	cacheable: boolean;

	enabled(): boolean;
	provide<T = IResult<any>>(expression: string): T | undefined;
}
