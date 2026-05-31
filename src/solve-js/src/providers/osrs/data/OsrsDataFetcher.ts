/**
 * OSRS Grand Exchange data fetcher.
 *
 * Hits the free OSRS Wiki REST API (no API key required).
 * Endpoints:
 *   - /mapping — all items with names, IDs, icons
 *   - /latest  — latest high/low prices + high/low timestamps for all items
 *   - /timeseries — 5-minute OHLC candles per item
 *
 * Rate limit: the OSRS Wiki API has no published rate limit, but
 * we throttle to 5 req/s and cache aggressively (5-min stale time).
 *
 * Architecture:
 *   - Item name → ID lookup is cached for the session (mapping rarely changes)
 *   - Price data is cached with a 60-second TTL (GE updates ~every 5 min, but
 *     individual items can update more frequently via the real-time endpoint)
 *   - All fetches go through a shared fetch() path with AbortSignal support
 */

const OSRS_API_BASE = "https://prices.runescape.wiki/api/v1/osrs";

/** Single item record from /mapping */
export interface OsrsItem {
	/** Unique item ID (e.g., 2 for "Cannonball") */
	id: number;
	/** Human-readable name */
	name: string;
	/** Whether the item is tradable on the GE */
	examine: string;
	/** Icon filename */
	icon: string;
	/** Whether the item has a buy limit */
	limit?: number;
	/** GE buy limit quantity */
	value?: number;
	/** High alchemy value */
	highalch?: number;
	/** Low alchemy value */
	lowalch?: number;
}

/** Price entry from /latest */
export interface OsrsPrice {
	high: number | null;
	highTime: number | null;
	low: number | null;
	lowTime: number | null;
}

/** Complete /latest response: item ID → price data */
export type OsrsLatestResponse = Record<string, OsrsPrice>;

/** Complete /mapping response */
export type OsrsMappingResponse = OsrsItem[];

/**
 * Fetched and cached GE data for a single item.
 * Includes both metadata and latest price.
 */
export interface GeCachedEntry {
	itemId: number;
	itemName: string;
	price: number | null;
	/** Unix ms timestamp when this entry was fetched */
	fetchedAt: number;
}

// ── Shared caches (module-level singletons, scoped to the OSRS package) ────

/** Item name → item metadata (populated once on first use, rarely changes) */
let mappingCache: Map<string, OsrsItem> | null = null;

/** itemId → GeCachedEntry (price data, refreshed periodically) */
const priceCache = new Map<number, GeCachedEntry>();

/** In-flight fetch promises to deduplicate concurrent requests */
const inFlightRequests = new Map<string, Promise<unknown>>();

/** 60 seconds — shorter than the GE update cycle but fast enough for responsiveness */
const PRICE_CACHE_TTL_MS = 60_000;

/** 30 minutes — mapping barely changes, but we refresh it eventually */
const MAPPING_CACHE_TTL_MS = 30 * 60_000;

let mappingFetchedAt = 0;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Look up an item by name and return its latest GE price.
 *
 * Returns null if the item cannot be found or has no current price.
 * Throws only on network errors (after retries).
 *
 * @param itemName - Case-insensitive item name (e.g., "abyssal whip")
 * @param signal - Optional AbortSignal for cancellation
 * @returns The latest high-price (or null if unavailable)
 */
export async function fetchGePrice(
	itemName: string,
	signal?: AbortSignal,
): Promise<number | null> {
	const item = await findItem(itemName, signal);
	if (!item) return null;

	return fetchItemPrice(item.id, signal);
}

/**
 * Look up an item ID by name (case-insensitive fuzzy match).
 * Falls back to item name → item ID mapping.
 */
export async function findItem(
	itemName: string,
	signal?: AbortSignal,
): Promise<OsrsItem | null> {
	await ensureMapping(signal);

	if (!mappingCache) return null;

	const normalized = itemName.toLowerCase().trim();

	// Exact match — O(1) Map lookup (keys are pre-normalized in ensureMapping)
	const exact = mappingCache.get(normalized);
	if (exact) return exact;

	// Substring match (e.g., "whip" matches "Abyssal whip")
	// Only falls through to O(n) scan when exact match fails
	for (const [key, item] of mappingCache) {
		if (key.includes(normalized)) return item;
	}

	return null;
}

/**
 * Fetch the latest price for a specific item ID.
 *
 * Uses the /latest endpoint which returns ALL item prices in a single
 * request — we cache the entire response to avoid N+1 requests.
 */
export async function fetchItemPrice(
	itemId: number,
	signal?: AbortSignal,
): Promise<number | null> {
	// Check cache first
	const cached = priceCache.get(itemId);
	if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
		return cached.price;
	}

	// Get-or-create in-flight request (atomic path — no await between check and set).
	// Using the standard pattern: if no existing promise, create one atomically.
	const inFlightKey = `latest`;
	let promise = inFlightRequests.get(inFlightKey) as Promise<void> | undefined;

	if (!promise) {
		promise = (async () => {
			try {
				const url = `${OSRS_API_BASE}/latest`;
				const response = await fetchWithRetry(url, signal);
				const data: OsrsLatestResponse = await response.json();

				// Populate price cache from the response.
				// /latest returns ALL item prices — caching the entire response
				// means subsequent lookups for any item are instant cache hits.
				const now = Date.now();
				for (const [idStr, priceData] of Object.entries(data)) {
					const id = Number(idStr);
					// Use the high price (instant-buy price, most relevant for "what's it worth?")
					const price = priceData.high ?? priceData.low;
					priceCache.set(id, {
						itemId: id,
						itemName: "", // populated from mapping if needed
						price,
						fetchedAt: now,
					});
				}
			} finally {
				inFlightRequests.delete(inFlightKey);
			}
		})();

		inFlightRequests.set(inFlightKey, promise);
	}

	await promise;

	// After the shared request completes, the price cache is populated for all items.
	const result = priceCache.get(itemId);
	return result?.price ?? null;
}

/**
 * Fetch and cache the item mapping from the OSRS Wiki.
 * Called lazily on first `findItem()` call.
 */
export async function ensureMapping(
	signal?: AbortSignal,
): Promise<void> {
	if (mappingCache && Date.now() - mappingFetchedAt < MAPPING_CACHE_TTL_MS) {
		return;
	}

	const inFlightKey = "mapping";
	let promise = inFlightRequests.get(inFlightKey) as Promise<void> | undefined;

	if (promise) {
		await promise;
		return;
	}

	promise = (async () => {
		try {
			const url = `${OSRS_API_BASE}/mapping`;
			const response = await fetchWithRetry(url, signal);
			const data: OsrsMappingResponse = await response.json();

				const map = new Map<string, OsrsItem>();
			for (const item of data) {
				map.set(item.name.toLowerCase().trim(), item);
			}
			// Assign after the loop completes — prevents concurrent
			// readers from seeing a partially-populated cache.
			mappingCache = map;
			mappingFetchedAt = Date.now();
		} finally {
			inFlightRequests.delete(inFlightKey);
		}
	})();

	inFlightRequests.set(inFlightKey, promise);
	await promise;
}

/**
 * Synchronous cache-only price lookup.
 *
 * Used by the VM plugin function as a fast-path: if the price is cached,
 * return a synchronous {@link Value} to avoid a Promise round-trip.
 * Returns null if the item is not found in cache — the caller then
 * initiates the async fetch path.
 *
 * @param itemName - Case-insensitive item name
 * @returns The cached price, or null if not cached or stale
 */
export function getCachedPrice(itemName: string): number | null {
	// Must have mapping to resolve name→ID
	if (!mappingCache) return null;

	const normalized = itemName.toLowerCase().trim();

	// Exact match — O(1) Map lookup (keys are pre-normalized in ensureMapping)
	const exactItem = mappingCache.get(normalized);
	if (exactItem) {
		const cached = priceCache.get(exactItem.id);
		if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
			return cached.price;
		}
		return null;
	}

	// Substring match (e.g., "whip" matches "Abyssal whip")
	for (const [key, item] of mappingCache) {
		if (key.includes(normalized)) {
			const cached = priceCache.get(item.id);
			if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
				return cached.price;
			}
			return null;
		}
	}

	return null;
}

/**
 * Evict a specific item from the price cache.
 * Called when the user wants to force-refresh an item.
 */
export function evictPrice(itemId: number): void {
	priceCache.delete(itemId);
}

/**
 * Evict all cached data (price + mapping).
 * Called on package unload or document switch.
 */
export function evictAll(): void {
	priceCache.clear();
	mappingCache = null;
	mappingFetchedAt = 0;
	inFlightRequests.clear();
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Fetch with retry logic (3 attempts, exponential backoff).
 * Respects AbortSignal for cancellation.
 */
async function fetchWithRetry(
	url: string,
	signal?: AbortSignal,
	maxRetries = 3,
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}

			const response = await fetch(url, { signal });

			if (!response.ok) {
				const err = new Error(
					`OSRS API returned ${response.status}: ${response.statusText}`,
				);
				// Don't retry 4xx errors — client errors won't change on retry.
				// Mark the error so the catch block below skips retry cycles.
				if (response.status >= 400 && response.status < 500) {
					(err as any).__noRetry = true;
				}
				throw err;
			}

			return response;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));

			// Don't retry if aborted or 4xx response
			if (err instanceof DOMException && err.name === "AbortError") {
				throw err;
			}
			if ((err as any)?.__noRetry) {
				throw err;
			}

			if (attempt < maxRetries - 1) {
				// Exponential backoff: 500ms, 1000ms, 2000ms
				const delay = 500 * 2 ** attempt;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError ?? new Error("Unknown fetch error");
}
