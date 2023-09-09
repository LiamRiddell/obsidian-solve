export interface IProvider {
	name: string;

	provide(sentence: string, raw: boolean): string | undefined;
}
