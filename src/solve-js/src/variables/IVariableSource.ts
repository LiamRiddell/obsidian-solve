export interface IVariableSource {
	name: string;
	priority: number;
	get(name: string): Promise<number | string | undefined>;
	set(name: string, value: number | string): Promise<void>;
}
