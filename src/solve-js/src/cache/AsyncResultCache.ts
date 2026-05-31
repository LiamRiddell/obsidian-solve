import type { Value } from "@solve-js/vm/Value";

/**
 * Singleton cache for synchronously resolving previously-fetched async values.
 *
 * **Per-package isolation:** Each package gets its own namespace-scoped cache.
 * Package A cannot read or overwrite Package B's cached data.
 *
 * Keys follow the format: `{packageId}:{domain}:{fingerprint}`
 * - packageId: fast random ID generated at registration time ("o3k20")
 * - domain: declared by the package ("rates", "weather.current")
 * - fingerprint: deterministic hash of arguments (for deduplication)
 *
 * Thread-safety: Not needed. ExpressionEngine is single-threaded.
 *
 * Lifecycle:
 * - Entries are set when async resolution completes
 * - Entries are checked on every evaluation (hot path — O(1) Map lookup)
 * - Entries are cleared on document switch or package unload
 */
export class AsyncResultCache {
	/** Per-package resolved values: packageId → (key → Value) */
	private static stores = new Map<string, Map<string, Value>>();

	/** Per-package in-flight promises: packageId → (key → Promise<Value>) */
	private static inFlights = new Map<string, Map<string, Promise<Value>>>();

	/** Per-package errors: packageId → (key → Error) */
	private static errorStores = new Map<string, Map<string, Error>>();

	/** Maximum entries per package (default 1000). Prevents one package from exhausting cache. */
	private static maxPerPackage = 1000;

	// ── Package lifecycle ───────────────────────────────────────────────

	/** Ensure a package has storage maps. Called on first use. */
	private static ensurePackage(packageId: string): void {
		if (!this.stores.has(packageId)) this.stores.set(packageId, new Map());
		if (!this.inFlights.has(packageId)) this.inFlights.set(packageId, new Map());
		if (!this.errorStores.has(packageId)) this.errorStores.set(packageId, new Map());
	}

	/** Remove all cached data for a package (on unregister). O(1). */
	static clearPackage(packageId: string): void {
		this.stores.delete(packageId);
		this.inFlights.delete(packageId);
		this.errorStores.delete(packageId);
	}

	/** Set the maximum entries allowed per package. */
	static setMaxPerPackage(n: number): void {
		this.maxPerPackage = n;
	}

	// ── Cache operations (scoped by packageId) ──────────────────────────

	/** Check if a key has a resolved value for a given package. */
	static has(packageId: string, key: string): boolean {
		return this.stores.get(packageId)?.has(key) ?? false;
	}

	/** Get a resolved value. Returns undefined if not resolved. */
	static get(packageId: string, key: string): Value | undefined {
		return this.stores.get(packageId)?.get(key);
	}

	/** Get an error for a failed resolution. */
	static getError(packageId: string, key: string): Error | undefined {
		return this.errorStores.get(packageId)?.get(key);
	}

	/** Store a resolved value. Clears in-flight and error state. */
	static set(packageId: string, key: string, value: Value): void {
		this.ensurePackage(packageId);
		const store = this.stores.get(packageId)!;

		// Enforce per-package entry limit (FIFO eviction)
		if (store.size >= this.maxPerPackage && !store.has(key)) {
			const firstKey = store.keys().next().value;
			if (firstKey !== undefined) store.delete(firstKey);
		}

		store.set(key, value);
		this.inFlights.get(packageId)?.delete(key);
		this.errorStores.get(packageId)?.delete(key);
	}

	/** Store an error for a key (failed resolution). */
	static setError(packageId: string, key: string, error: Error): void {
		this.ensurePackage(packageId);
		this.errorStores.get(packageId)!.set(key, error);
		this.inFlights.get(packageId)?.delete(key);
	}

	/** Check if a key is currently being fetched (in-flight). */
	static isInFlight(packageId: string, key: string): boolean {
		return this.inFlights.get(packageId)?.has(key) ?? false;
	}

	/** Register an in-flight promise for deduplication. */
	static registerInFlight(packageId: string, key: string, promise: Promise<Value>): void {
		this.ensurePackage(packageId);
		this.inFlights.get(packageId)!.set(key, promise);
	}

	/** Get the in-flight promise, or undefined. */
	static getInFlight(packageId: string, key: string): Promise<Value> | undefined {
		return this.inFlights.get(packageId)?.get(key);
	}

	// ── Bulk operations ────────────────────────────────────────────────

	/**
	 * Clear cached entries for a specific domain within a package.
	 * Used when a package wants to invalidate a specific domain without
	 * affecting other domains or other packages.
	 */
	static clearDomain(packageId: string, domain: string): void {
		// Keys in the inner Map are {domain}:{fingerprint} —
		// the packageId is the outer Map key, not part of the inner key.
		const prefix = `${domain}:`;
		const store = this.stores.get(packageId);
		if (store) {
			for (const key of store.keys()) {
				if (key.startsWith(prefix)) store.delete(key);
			}
		}
		const inFlight = this.inFlights.get(packageId);
		if (inFlight) {
			for (const key of inFlight.keys()) {
				if (key.startsWith(prefix)) inFlight.delete(key);
			}
		}
		const errorStore = this.errorStores.get(packageId);
		if (errorStore) {
			for (const key of errorStore.keys()) {
				if (key.startsWith(prefix)) errorStore.delete(key);
			}
		}
	}

	/**
	 * Clear cache entries matching a prefix across all packages.
	 * Used during package unregistration and resolver cleanup to
	 * invalidate all cached data for a given domain prefix.
	 */
	static clearPrefix(prefix: string): void {
		for (const [, store] of this.stores) {
			for (const key of store.keys()) {
				if (key.startsWith(prefix)) store.delete(key);
			}
		}
		for (const [, inFlight] of this.inFlights) {
			for (const key of inFlight.keys()) {
				if (key.startsWith(prefix)) inFlight.delete(key);
			}
		}
		for (const [, errorStore] of this.errorStores) {
			for (const key of errorStore.keys()) {
				if (key.startsWith(prefix)) errorStore.delete(key);
			}
		}
	}

	/** Clear all entries across all packages (document switch, engine reset). */
	static clearAll(): void {
		this.stores.clear();
		this.inFlights.clear();
		this.errorStores.clear();
	}

	// ── Diagnostics ────────────────────────────────────────────────────

	/** Total cached entries across all plugins. */
	static get size(): number {
		let total = 0;
		for (const store of this.stores.values()) total += store.size;
		return total;
	}

	/** Total in-flight async operations across all plugins. */
	static get inFlightCount(): number {
		let total = 0;
		for (const inFlight of this.inFlights.values()) total += inFlight.size;
		return total;
	}

	/** Number of registered packages with cache entries. */
	static get packageCount(): number {
		return this.stores.size;
	}

	/** Entries per package (for diagnostics). */
	static getPackageEntryCount(packageId: string): number {
		return this.stores.get(packageId)?.size ?? 0;
	}
}
