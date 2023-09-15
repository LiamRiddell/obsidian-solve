export interface IProvider {
	name: string;

	provide<T = string>(sentence: string, raw: boolean): T | undefined;
}
