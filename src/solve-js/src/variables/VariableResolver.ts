import { IVariableSource } from "@solve-js/variables/IVariableSource";

/**
 * Resolves variable names by querying registered {@link IVariableSource} instances
 * in priority order. Supports caching for repeated lookups.
 *
 * Sources are sorted by priority (lowest first) on registration. When resolving
 * a variable, sources are queried in order and the first non-undefined result wins.
 */
export class VariableResolver {
	private sources: IVariableSource[] = [];
	private cache: Map<string, number | string | undefined> = new Map();
	private cacheEnabled = true;

	/**
	 * Register a variable source with a given priority.
	 * Sources are sorted so lower-priority-number sources are queried first.
	 *
	 * @param source - The variable source to register
	 */
	registerSource(source: IVariableSource): void {
		this.sources.push(source);
		this.sources.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Remove a previously registered variable source (identity match).
	 * The lookup cache is cleared because resolution results may change
	 * once the source no longer participates.
	 *
	 * @param source - The exact source instance passed to registerSource.
	 */
	unregisterSource(source: IVariableSource): void {
		const idx = this.sources.indexOf(source);
		if (idx !== -1) {
			this.sources.splice(idx, 1);
			this.cache.clear();
		}
	}

	/**
	 * Resolve a variable name to its value.
	 *
	 * Checks the cache first (if enabled), then queries registered sources
	 * in priority order. The first source returning a non-undefined value wins.
	 * Cached results are stored and returned on subsequent calls until invalidated.
	 *
	 * @param name - The variable name to resolve
	 * @returns The resolved value, or undefined if not found in any source
	 */
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

	/**
	 * Set a variable value across all registered sources.
	 * Also updates the local cache so subsequent reads return the new value.
	 *
	 * @param name - The variable name
	 * @param value - The value to set
	 */
	async set(name: string, value: number | string): Promise<void> {
		for (const source of this.sources) {
			await source.set(name, value);
		}
		this.cache.set(name, value);
	}

	/** Invalidate a single variable in the cache, forcing re-resolution on next read. */
	invalidate(name: string): void {
		this.cache.delete(name);
	}

	/** Invalidate all cached variable lookups. */
	invalidateAll(): void {
		this.cache.clear();
	}

	/** Enable or disable the lookup cache. When disabled, every read queries sources directly. */
	setCacheEnabled(enabled: boolean): void {
		this.cacheEnabled = enabled;
	}
}

/** Shared singleton VariableResolver instance. */
export const sharedVariableResolver = new VariableResolver();
