import { EResultType } from "@/constants/EResultType";

export interface IResult<T> {
	type: EResultType;
	value: T;
}
