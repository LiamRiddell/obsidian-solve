export interface IProvider {
	name: string;

	enabled(): boolean;
	provide<T = string>(sentence: string, raw: boolean): T | undefined;
}
