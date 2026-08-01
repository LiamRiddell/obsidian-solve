import type { QueryClient } from "@tanstack/query-core";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import type { Value } from "@solve-js/vm/Value";

/**
 * Result from a resolver's preflight() check.
 * Returned when async data is needed — the orchestrator uses this
 * to subscribe to the resolver and return a Pending value immediately.
 */
export interface AsyncCheckResult {
	/** Unique cache key for deduplication (e.g., "{packageId}:rates:USD:GBP") */
	queryKey: string;
	/** Promise that resolves to the final Value */
	resolver: Promise<Value>;
	/** Package owning this resolver */
	packageId: string;
	/** AbortSignal for stale-data prevention */
	signal: AbortSignal;
	/** Optional metadata for diagnostics */
	metadata?: Record<string, unknown>;
}

/**
 * Interface for async resolvers registered by packages/plugins.
 *
 * Each resolver handles a domain of async data (currency rates,
 * weather, stock prices, etc.). The preflight() method is called
 * BEFORE VM execution to check if all data is cached. If not,
 * it returns an AsyncCheckResult and the engine skips the VM,
 * returning a Pending value instead.
 */
export interface IAsyncResolver {
	/** Unique namespace for cache key scoping (e.g., "currency", "weather") */
	readonly namespace: string;

	/**
	 * Pre-flight check: called BEFORE VM execution.
	 *
	 * Returns null if all data for this expression is cached and ready.
	 * Returns an AsyncCheckResult if async work is needed.
	 *
	 * This method is synchronous — it only checks caches, never fetches.
	 * If data is missing, it creates a Promise and returns immediately.
	 *
	 * @param tokens - The lexed tokens for the expression
	 * @param bytecode - The compiled bytecode program
	 * @param pluginId - The plugin ID (for cache key scoping)
	 * @param signal - AbortSignal for the current evaluation
	 */
	preflight?(tokens: Token[], bytecode: BytecodeProgram, packageId: string, signal: AbortSignal, queryClient: QueryClient): AsyncCheckResult | null;

	/**
	 * Called when the resolver's namespace is being unregistered.
	 * Clean up any in-flight promises, clear caches, unsubscribe.
	 */
	destroy(): void;
}

/**
 * Registry of async resolvers, keyed by namespace.
 *
 * Plugins/packages register resolvers alongside their parselets
 * and opcode handlers. The engine calls preflightAll() before
 * VM execution to short-circuit async expressions.
 *
 * Lifecycle:
 * - register() — when a package is loaded
 * - unregister() — when a package is unloaded (clears cache entries)
 * - clear() — on document switch (clears all resolvers)
 */
export class ResolverRegistry {
	private resolvers = new Map<string, IAsyncResolver>();

	/**
	 * Register an async resolver.
	 *
	 * Each resolver must have a unique `namespace`. If a resolver with the
	 * same namespace is already registered, the old one is destroyed and
	 * replaced (with a console warning). Packages that need multiple async
	 * operations should use `asyncResolvers: [...]` with distinct namespaces
	 * (e.g., `"weather:current"`, `"weather:forecast"`).
	 */
	register(resolver: IAsyncResolver): void {
		// Clean up previous resolver with same namespace if any
		if (this.resolvers.has(resolver.namespace)) {
			console.warn(
				`[ResolverRegistry] Namespace "${resolver.namespace}" already registered. ` +
				`Destroying old resolver and overwriting. Use distinct namespaces ` +
				`(e.g., "${resolver.namespace}:sub1", "${resolver.namespace}:sub2") ` +
				`to avoid collisions when a package needs multiple async resolvers.`,
			);
			this.resolvers.get(resolver.namespace)!.destroy();
		}
		this.resolvers.set(resolver.namespace, resolver);
	}

	/**
	 * Unregister a resolver by namespace.
	 * Calls destroy() and clears all cache entries with that namespace prefix.
	 */
	unregister(namespace: string, queryClient?: QueryClient): void {
		const resolver = this.resolvers.get(namespace);
		if (resolver) {
			resolver.destroy();
			this.resolvers.delete(namespace);
		}
		// Clear all cache entries for this namespace via TanStack Query
		// Hierarchical keys: ["osrs"] clears all ["osrs", ...] queries
		if (queryClient) {
			queryClient.removeQueries({ queryKey: [namespace] });
		}
	}

	/**
	 * Run all registered resolvers' preflight checks against compiled bytecode.
	 *
	 * Returns the first AsyncCheckResult found, or null if all data is ready.
	 * Short-circuits on first pending — subsequent pending ops will be
	 * discovered on re-evaluation when the first resolves.
	 */
	preflightAll(tokens: Token[], bytecode: BytecodeProgram, packageId: string, signal: AbortSignal, queryClient: QueryClient): AsyncCheckResult | null {
		for (const resolver of this.resolvers.values()) {
			if (!resolver.preflight) continue;
			const result = resolver.preflight(tokens, bytecode, packageId, signal, queryClient);
			if (result) return result;
		}
		return null;
	}

	/**
	 * Get a resolver by namespace.
	 * Returns undefined if no resolver is registered for that namespace.
	 */
	get(namespace: string): IAsyncResolver | undefined {
		return this.resolvers.get(namespace);
	}

	/** Number of registered resolvers. */
	get size(): number {
		return this.resolvers.size;
	}

	/**
	 * Check if a resolver is registered for the given namespace.
	 */
	has(namespace: string): boolean {
		return this.resolvers.has(namespace);
	}

	/**
	 * Clear all resolvers (document switch, engine reset).
	 * Calls destroy() on each resolver and clears the map.
	 */
	clear(): void {
		for (const resolver of this.resolvers.values()) {
			resolver.destroy();
		}
		this.resolvers.clear();
	}
}
