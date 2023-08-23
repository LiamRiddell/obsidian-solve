export interface ISolveProvider {
	name: string;

	provide(sentence: string, raw: boolean): string | undefined;
}
