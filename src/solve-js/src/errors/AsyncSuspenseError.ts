import type { Value } from "@solve-js/vm/Value";

/**
 * @deprecated Use EvalResult discriminated union from VM.ts instead.
 * The VM no longer throws this — executeBytecode() returns
 * { type: 'pending', queryKey, resolver, pluginId, signal }
 * when async data is needed.
 *
 * Kept for backwards compatibility with any external code
 * that may catch or reference this error type.
 *
 * Previously: Thrown by opcode handlers or plugin functions
 * when async data is needed. Caught by ExpressionEngine outside
 * the VM hot loop.
 */
export class AsyncSuspenseError extends Error {
	/** Unique cache key for deduplication (e.g., "rate:USD:GBP") */
	readonly queryKey: string;
	/** Promise that resolves to the final Value */
	readonly resolver: Promise<Value>;
	/** Optional metadata for diagnostics */
	readonly metadata?: Record<string, unknown>;

	constructor(
		queryKey: string,
		resolver: Promise<Value>,
		metadata?: Record<string, unknown>
	) {
		super(`Async suspense: ${queryKey}`);
		this.name = 'AsyncSuspenseError';
		this.queryKey = queryKey;
		this.resolver = resolver;
		this.metadata = metadata;
	}

	/**
	 * Check if an error is an AsyncSuspenseError.
	 * Used by catch blocks to distinguish suspense from other errors.
	 */
	static isAsyncSuspense(error: unknown): error is AsyncSuspenseError {
		return error instanceof AsyncSuspenseError;
	}
}
