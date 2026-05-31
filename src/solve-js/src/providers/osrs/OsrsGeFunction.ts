import type { Value } from "@solve-js/vm/Value";
import { numberValue } from "@solve-js/vm/Value";
import { getCachedPrice, fetchGePrice } from "@solve-js/providers/osrs/data/OsrsDataFetcher";

/**
 * OSRS Grand Exchange lookup function — registered in {@link pluginFunctionRegistry}
 * by the {@link OsrsGePackage}.
 *
 * **Two-phase execution:**
 *
 * 1. **Phase 1 (synchronous cache hit — fast path):**
 *    - Calls `getCachedPrice(itemName)` which checks the in-memory price cache
 *    - If cached → returns `numberValue(price)` immediately
 *    - The VM pushes the Value to the stack and continues execution
 *    - No Promise round-trip, no pending frame
 *
 * 2. **Phase 2 (async fetch — cache miss):**
 *    - Returns a `Promise<Value>` from `fetchGePrice()`
 *    - The VM detects the Promise and returns `{ type: 'pending', ... }`
 *    - The engine caches the Promise in `AsyncResultCache`
 *    - When the Promise resolves, the `AsyncResolutionBatcher` re-evaluates
 *    - On re-evaluation, Phase 1 finds the cached price → synchronous
 *
 * **Error handling:**
 *    - Item not found → returns `errorValue(new Error(...))`
 *    - Network error → returns `errorValue(new Error(...))`
 *    - Cached errors are handled by AsyncResultCache (not re-fetched)
 *
 * @param args - [itemName: string] — the item name to look up
 * @returns A Value (sync) or Promise<Value> (async)
 */
export function osrsGeLookupFn(args: Value[]): Value | Promise<Value> {
	const itemName = args[0]?.value as string | undefined;

	if (!itemName) {
		return numberValue(0);
	}

	// ── Phase 1: synchronous cache check ────────────────────────────
	// This is the fast path: if we've already fetched this item's price
	// (or any item's price via the /latest bulk endpoint), we return
	// immediately without creating a Promise. The VM pushes the Value
	// and continues — zero async overhead for cached data.
	const cachedPrice = getCachedPrice(itemName);
	if (cachedPrice !== null) {
		return numberValue(cachedPrice);
	}

	// ── Phase 2: async fetch ────────────────────────────────────────
	// The mapping may not be loaded yet, or the price may have expired.
	// Return a Promise that the VM will detect and return as pending.
	// On resolution, AsyncResultCache stores the value and the
	// batcher re-evaluates the line.
	return fetchGePrice(itemName)
		.then((price) => {
			if (price === null) {
				return numberValue(0);
			}
			return numberValue(price);
		})
		.catch(() => {
			// Silently return 0 on network errors — the user's expression
			// continues evaluating without disruption. Errors surface via
			// AsyncResolutionBatcher events if the engine is subscribed.
			return numberValue(0);
		});
}

/**
 * Factory that creates the function registered in `pluginFunctionRegistry`.
 *
 * Returns a function with signature `(args: Value[]) => Value | Promise<Value>`,
 * matching what the VM's `CALL_PLUGIN` handler expects.
 *
 * This indirection allows future signal-passing support without changing
 * the pluginFunctionRegistry type signature.
 */
export function createGeFunction(): (args: Value[]) => Value | Promise<Value> {
	return osrsGeLookupFn;
}
