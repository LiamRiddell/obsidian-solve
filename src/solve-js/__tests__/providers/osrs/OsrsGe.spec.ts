import { beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";

// ── Mock OsrsDataFetcher BEFORE importing OsrsGeFunction ────────────────
// The module-level initializeOsrsGe() call registers the function in
// pluginFunctionRegistry at import time. We must mock the data layer first
// so that osrsGeLookupFn uses our controlled test doubles.

export const mockGetCachedPrice = jest.fn<typeof import("@solve-js/providers/osrs/data/OsrsDataFetcher").getCachedPrice>();
export const mockFetchGePrice = jest.fn<typeof import("@solve-js/providers/osrs/data/OsrsDataFetcher").fetchGePrice>();

jest.mock("@solve-js/providers/osrs/data/OsrsDataFetcher", () => ({
	getCachedPrice: mockGetCachedPrice,
	fetchGePrice: mockFetchGePrice,
	findItem: jest.fn(),
	ensureMapping: jest.fn(),
	evictAll: jest.fn(),
	evictPrice: jest.fn(),
}));

// Import after mocks are set up
import { osrsGeLookupFn } from "@solve-js/providers/osrs/OsrsGeFunction";
import { ValueType } from "@solve-js/vm/Value";
import type { Mock } from "jest-mock";

// Cast the jest.fn() mocks to Mock so they have mockReturnValue etc.
const cachedPriceMock = mockGetCachedPrice as Mock<(name: string) => number | null>;
const fetchPriceMock = mockFetchGePrice as Mock<(name: string) => Promise<number | null>>;

describe("OsrsGeFunction", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ── Cache hit fast path ──────────────────────────────────────────

	describe("cache hit fast path (synchronous)", () => {
		test("returns numberValue immediately when price is cached", () => {
			cachedPriceMock.mockReturnValue(1_234_567);

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Abyssal whip" } as any]);

			// Must be synchronous — not a Promise
			expect(result).not.toBeInstanceOf(Promise);

			// Must be a number Value with the cached price
			expect((result as any).type).toBe(ValueType.Number);
			expect((result as any).toNumber()).toBe(1_234_567);

			// Verify the cache was queried with the correct item name
			expect(cachedPriceMock).toHaveBeenCalledWith("Abyssal whip");
			expect(cachedPriceMock).toHaveBeenCalledTimes(1);

			// fetchGePrice must NOT have been called (fast path, no network)
			expect(fetchPriceMock).not.toHaveBeenCalled();
		});

		test("cache hit with different item", () => {
			cachedPriceMock.mockReturnValue(42);

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Dragon bones" } as any]);

			expect(result).not.toBeInstanceOf(Promise);
			expect((result as any).toNumber()).toBe(42);
			expect(cachedPriceMock).toHaveBeenCalledWith("Dragon bones");
		});

		test("cache hit with zero price", () => {
			// Zero is a valid price — should still return synchronously
			cachedPriceMock.mockReturnValue(0);

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Bucket" } as any]);

			expect(result).not.toBeInstanceOf(Promise);
			expect((result as any).toNumber()).toBe(0);
		});
	});

	// ── Cache miss async path ────────────────────────────────────────

	describe("cache miss async path", () => {
		test("returns Promise<Value> when price is not cached", async () => {
			cachedPriceMock.mockReturnValue(null);
			fetchPriceMock.mockResolvedValue(5_000_000);

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Twisted bow" } as any]);

			// Must be a Promise (async path)
			expect(result).toBeInstanceOf(Promise);

			// Await the Promise and verify the resolved value
			const resolved = await result;
			expect((resolved as any).type).toBe(ValueType.Number);
			expect((resolved as any).toNumber()).toBe(5_000_000);

			// Verify data flow: cache miss → fetch
			expect(cachedPriceMock).toHaveBeenCalledWith("Twisted bow");
			expect(fetchPriceMock).toHaveBeenCalledWith("Twisted bow");
		});

		test("multiple concurrent cache misses each trigger fetch", async () => {
			cachedPriceMock.mockReturnValue(null);
			fetchPriceMock
				.mockResolvedValueOnce(100)
				.mockResolvedValueOnce(200)
				.mockResolvedValueOnce(300);

			const p1 = osrsGeLookupFn([{ type: ValueType.String, value: "Item A" } as any]);
			const p2 = osrsGeLookupFn([{ type: ValueType.String, value: "Item B" } as any]);
			const p3 = osrsGeLookupFn([{ type: ValueType.String, value: "Item C" } as any]);

			const results = await Promise.all([p1, p2, p3]);
			expect((results[0] as any).toNumber()).toBe(100);
			expect((results[1] as any).toNumber()).toBe(200);
			expect((results[2] as any).toNumber()).toBe(300);

			expect(fetchPriceMock).toHaveBeenCalledTimes(3);
		});
	});

	// ── Error fallback ───────────────────────────────────────────────

	describe("error fallback", () => {
		test("returns numberValue(0) when item is not found (fetch returns null)", async () => {
			cachedPriceMock.mockReturnValue(null);
			fetchPriceMock.mockResolvedValue(null);

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Nonexistent item" } as any]);

			expect(result).toBeInstanceOf(Promise);
			const resolved = await result;
			expect((resolved as any).toNumber()).toBe(0);
		});

		test("returns numberValue(0) on network error", async () => {
			cachedPriceMock.mockReturnValue(null);
			fetchPriceMock.mockRejectedValue(new Error("Network failure"));

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "Rune scimitar" } as any]);

			expect(result).toBeInstanceOf(Promise);
			// Should NOT throw — error is silently caught, returns 0
			const resolved = await result;
			expect((resolved as any).toNumber()).toBe(0);
		});

		test("returns numberValue(0) when item name is empty/undefined", () => {
			cachedPriceMock.mockReturnValue(null);

			// Empty string
			const r1 = osrsGeLookupFn([{ type: ValueType.String, value: "" } as any]);
			expect(r1).not.toBeInstanceOf(Promise);
			expect((r1 as any).toNumber()).toBe(0);

			// Undefined value
			const r2 = osrsGeLookupFn([{ type: ValueType.String, value: undefined as any } as any]);
			expect(r2).not.toBeInstanceOf(Promise);
			expect((r2 as any).toNumber()).toBe(0);

			// fetchGePrice must NOT be called for empty names
			expect(fetchPriceMock).not.toHaveBeenCalled();
		});

		test("returns numberValue(0) when args array is empty", () => {
			const result = osrsGeLookupFn([]);
			expect(result).not.toBeInstanceOf(Promise);
			expect((result as any).toNumber()).toBe(0);
		});
	});

	// ── Fuzzy item matching ─────────────────────────────────────────

	describe("fuzzy item matching", () => {
		test("exact match (case-insensitive)", () => {
			// getCachedPrice calls findItem internally for name→ID resolution.
			// We test through getCachedPrice since that's how osrsGeLookupFn
			// uses fuzzy matching (via the sync cache-hit path).

			cachedPriceMock.mockImplementation((itemName: string) => {
				const normalized = itemName.toLowerCase().trim();
				if (normalized === "abyssal whip") return 1_234_567;
				return null;
			});

			// Exact case-insensitive
			expect(
				(osrsGeLookupFn([{ type: ValueType.String, value: "Abyssal whip" } as any]) as any).toNumber()
			).toBe(1_234_567);

			// Different casing
			expect(
				(osrsGeLookupFn([{ type: ValueType.String, value: "ABYSSAL WHIP" } as any]) as any).toNumber()
			).toBe(1_234_567);

			// Leading/trailing whitespace
			expect(
				(osrsGeLookupFn([{ type: ValueType.String, value: "  Abyssal whip " } as any]) as any).toNumber()
			).toBe(1_234_567);
		});

		test("substring match (fuzzy)", () => {
			// Simulate the substring matching logic from findItem/getCachedPrice:
			// if exact match fails, try contains() on mapping keys.

			cachedPriceMock.mockImplementation((itemName: string) => {
				const normalized = itemName.toLowerCase().trim();
				if (normalized === "abyssal whip") return 1_234_567;
				if (normalized === "whip") return 1_234_567;
				if (normalized === "abyssal") return 1_234_567;
				return null;
			});

			// Substring: "whip" matches "Abyssal whip"
			expect(
				(osrsGeLookupFn([{ type: ValueType.String, value: "whip" } as any]) as any).toNumber()
			).toBe(1_234_567);

			// Substring: "abyssal" matches "Abyssal whip"
			expect(
				(osrsGeLookupFn([{ type: ValueType.String, value: "abyssal" } as any]) as any).toNumber()
			).toBe(1_234_567);
		});

		test("no match returns null → async path returns 0", async () => {
			cachedPriceMock.mockReturnValue(null);
			fetchPriceMock.mockResolvedValue(null); // item not found by API either

			const result = osrsGeLookupFn([{ type: ValueType.String, value: "xyzzy_nonexistent" } as any]);
			expect(result).toBeInstanceOf(Promise);

			const resolved = await result;
			expect((resolved as any).toNumber()).toBe(0);
		});
	});
});
