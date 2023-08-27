import { ResultType } from "@/constants/ResultType";

export interface IResult<T> {
	type: ResultType;
	value: T;
}
