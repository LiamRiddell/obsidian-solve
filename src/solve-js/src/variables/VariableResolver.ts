import { IVariableSource } from "@solve-js/variables/IVariableSource";

export class VariableResolver {
	private sources: IVariableSource[] = [];
	private cache: Map<string, number | string | undefined> = new Map();
	private cacheEnabled = true;

	registerSource(source: IVariableSource): void {
		this.sources.push(source);
		this.sources.sort((a, b) => a.priority - b.priority);
	}

	async resolve(name: string): Promise<number | string | undefined> {
		if (this.cacheEnabled) {
			const cached = this.cache.get(name);
			if (cached !== undefined) return cached;
		}

		for (const source of this.sources) {
			const value = await source.get(name);
			if (value !== undefined) {
				if (this.cacheEnabled) {
					this.cache.set(name, value);
				}
				return value;
			}
		}

		return undefined;
	}

	async set(name: string, value: number | string): Promise<void> {
		for (const source of this.sources) {
			await source.set(name, value);
		}
		this.cache.set(name, value);
	}

	invalidate(name: string): void {
		this.cache.delete(name);
	}

	invalidateAll(): void {
		this.cache.clear();
	}

	setCacheEnabled(enabled: boolean): void {
		this.cacheEnabled = enabled;
	}
}

export const sharedVariableResolver = new VariableResolver();
