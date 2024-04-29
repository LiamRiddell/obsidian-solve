import { IProvider } from "@/providers/IProvider";
import { IResult } from "@/results/definition/IResult";
import { expect } from "@jest/globals";

export function expectProviderResultAndType<T extends IResult<any>>(
	provider: IProvider,
	expression: string,
	expected: T
) {
	const result = provider.provide<T>(expression);

	expect(result).toBeDefined();

	expect(result).toBeInstanceOf(expected.constructor);

	expect(result?.value).toBe(expected.value);

	return result;
}
