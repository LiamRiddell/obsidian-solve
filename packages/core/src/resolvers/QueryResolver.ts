import type { QueryClient } from "@tanstack/query-core";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { errorValue, type Value } from "@solve-js/vm/Value";
import type { IAsyncResolver, AsyncCheckResult } from "@solve-js/resolvers/ResolverRegistry";
import { getActiveQueryClient } from "@solve-js/services/DataQueryService";
import { createTimeoutSignal } from "@solve-js/utilities/TimeoutSignal";

/**
 * Generic async resolver for the common "single query string in, single
 * `Value` out" shape — one `CALL_PLUGIN` opcode with exactly one preceding
 * `PUSH_STRING` argument, resolved via a live fetch and cached through
 * TanStack Query. {@link IAsyncResolver}'s own JSDoc names this exact
 * target ("currency rates, weather, stock prices, etc."); this factory is
 * the generalization of the pattern two existing implementations already
 * prove out by hand — `uom/CurrencyResolver.ts` (a currency-specific
 * dual-operand variant) and `examples/osrs/OsrsAsyncResolver.ts`
 * (`examples/osrs/OsrsVmHandler.ts` for the synchronous read-back half) —
 * so a new query-based package (weather, stocks, a knowledge lookup) only
 * needs to supply the fetch call and the response-to-`Value` mapping,
 * not reimplement bytecode scanning, cache-key management, or
 * Suspense/timeout/cooldown plumbing again.
 *
 * Usage: call {@link createQueryResolver} once per package, register the
 * returned `resolver` via `IEnginePackage.asyncResolvers`, and register the
 * returned `pluginFunction` at `pluginFunctionIndex` via
 * `IEnginePackage.pluginFunctions` (the same `CALL_PLUGIN` dispatch every
 * other package function uses — see `allocatePluginFunctionIndex()` in
 * `vm/VMBuiltins.ts`).
 */
export interface QueryResolverOptions {
	/** Unique namespace for cache-key scoping and diagnostics (e.g. "weather"). */
	namespace: string;
	/**
	 * The `CALL_PLUGIN` index this resolver watches for — must be the same
	 * index the package's parselet emits and registers `pluginFunction`
	 * under (via `allocatePluginFunctionIndex()`).
	 */
	pluginFunctionIndex: number;
	/**
	 * Perform the live fetch for `query` and return the resolved `Value`.
	 * Receives an `AbortSignal` that fires on caller cancellation OR the
	 * `timeoutMs` deadline, whichever comes first — pass it to `fetch()`.
	 */
	fetchQuery: (query: string, signal: AbortSignal) => Promise<Value>;
	/** TanStack Query staleTime in ms — how long a resolved value stays cached before a re-evaluation refetches it. Default 5 minutes. */
	staleTimeMs?: number;
	/** Hard timeout for `fetchQuery` — an unresponsive API must not block re-evaluation indefinitely. Default 10s. */
	timeoutMs?: number;
	/**
	 * How long a FAILED fetch's error result stays cached before the next
	 * evaluation retries it. Without this, a transient outage would either
	 * retry on every keystroke (no cooldown) or stay failed for the full
	 * `staleTimeMs` (treating the error like real data). Default 30s.
	 */
	failureCooldownMs?: number;
	/**
	 * Build the `Value` a failed fetch resolves to. Defaults to an honest
	 * `errorValue()` (matching `UOM_CONVERT_TO`'s `CURRENCY_RATE_UNAVAILABLE`
	 * pattern in `vm/VM.ts` — never silently substitute a stale/wrong value
	 * for a real failure). Override for a package that prefers a graceful
	 * fallback value instead (e.g. OSRS's `0 gp` with a `timedOut` flag).
	 */
	onError?: (query: string, error: unknown) => Value;
}

export interface QueryResolverPackage {
	/** Register via `IEnginePackage.asyncResolvers`. */
	resolver: IAsyncResolver;
	/** Register via `IEnginePackage.pluginFunctions` at `pluginFunctionIndex`. */
	pluginFunction: (args: Value[]) => Value;
}

function defaultOnError(namespace: string): (query: string, error: unknown) => Value {
	return (query, error) =>
		errorValue(
			`${namespace.toUpperCase()}_QUERY_FAILED`,
			`Failed to resolve "${query}": ${error instanceof Error ? error.message : String(error)}`
		);
}

export function createQueryResolver(opts: QueryResolverOptions): QueryResolverPackage {
	const staleTimeMs = opts.staleTimeMs ?? 5 * 60 * 1000;
	const timeoutMs = opts.timeoutMs ?? 10_000;
	const failureCooldownMs = opts.failureCooldownMs ?? 30_000;
	const onError = opts.onError ?? defaultOnError(opts.namespace);

	const queryKeyFor = (query: string) => [opts.namespace, query] as const;

	async function fetchAndCache(query: string, signal: AbortSignal, queryClient: QueryClient): Promise<Value> {
		const { signal: fetchSignal, cleanup } = createTimeoutSignal(signal, timeoutMs, `${opts.namespace} query`);
		try {
			return await opts.fetchQuery(query, fetchSignal);
		} catch (error) {
			const failedValue = onError(query, error);
			// Bound the failure's lifetime in the cache separately from
			// staleTimeMs (which is tuned for successful results) — without
			// this, a transient failure would either be retried on every
			// keystroke or persist as "the answer" for the full staleTime.
			setTimeout(() => {
				const current = queryClient.getQueryData(queryKeyFor(query));
				if (current === failedValue) {
					queryClient.removeQueries({ queryKey: queryKeyFor(query), exact: true });
				}
			}, failureCooldownMs);
			return failedValue;
		} finally {
			cleanup();
		}
	}

	const resolver: IAsyncResolver = {
		namespace: opts.namespace,

		preflight(
			_tokens: Token[],
			bytecode: BytecodeProgram,
			packageId: string,
			signal: AbortSignal,
			queryClient: QueryClient
		): AsyncCheckResult | null {
			const { opcodes, strings } = bytecode;
			const len = opcodes.length;
			let i = 0;

			while (i < len) {
				const op = opcodes[i] as OpCode;

				if (op === OpCode.CALL_PLUGIN && i + 2 < len) {
					const fnIdx = opcodes[i + 1];
					const argCount = opcodes[i + 2];

					if (
						fnIdx === opts.pluginFunctionIndex &&
						argCount >= 1 &&
						i >= 2 &&
						opcodes[i - 2] === OpCode.PUSH_STRING
					) {
						const query = strings[opcodes[i - 1]];
						const key = queryKeyFor(query);
						if (queryClient.getQueryData(key) === undefined) {
							const resolverPromise = queryClient.fetchQuery({
								queryKey: key,
								queryFn: ({ signal: qSignal }) => fetchAndCache(query, qSignal, queryClient),
								staleTime: staleTimeMs,
							});
							return { queryKey: key.join(":"), resolver: resolverPromise, packageId, signal, metadata: { query } };
						}
					}
					i += 3;
					continue;
				}

				switch (op) {
					case OpCode.PUSH_NUMBER: case OpCode.PUSH_BIGINT: case OpCode.PUSH_HEX:
					case OpCode.PUSH_STRING: case OpCode.PUSH_BOOLEAN:
					case OpCode.LOAD_VAR: case OpCode.STORE_VAR:
					case OpCode.LOAD_GLOBAL_VAR: case OpCode.STORE_GLOBAL_VAR:
					case OpCode.DEFINE_USER_FUNCTION:
						i += 2; break;
					case OpCode.CALL_BUILTIN: case OpCode.CALL_USER_FUNCTION:
						i += 3; break;
					case OpCode.MAT_NEW:
						i += 3; break;
					case OpCode.MAP_INVOKE: case OpCode.REDUCE_INVOKE:
						i += 4; break;
					default:
						i++; break;
				}
			}

			return null;
		},

		destroy(): void {
			// Cache cleared by ResolverRegistry.unregister() via removeQueries({ queryKey: [namespace] }).
		},
	};

	const pluginFunction = (args: Value[]): Value => {
		const query = args[0]?.value as string;
		const cached = getActiveQueryClient()?.getQueryData(queryKeyFor(query));
		if (cached !== undefined) return cached as Value;
		// preflight() guarantees this is cached before the VM ever runs the
		// CALL_PLUGIN that reaches here — this is an honest "shouldn't
		// happen" fallback, not a real code path.
		return errorValue(`${opts.namespace.toUpperCase()}_NOT_PREFLIGHTED`, `No cached result for "${query}"`);
	};

	return { resolver, pluginFunction };
}
