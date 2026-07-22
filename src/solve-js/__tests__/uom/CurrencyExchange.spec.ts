/**
 * CurrencyExchange — Integration Tests
 *
 * Tests the TanStack Query-backed currency exchange service:
 * - Fallback rates, rate caching (sync+async)
 * - Currency conversion (convert, convertSync)
 * - Currency validation (isCurrency)
 */

import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { CurrencyExchangeService } from "@solve-js/uom/CurrencyExchange";

// Mock fetch to avoid live network calls
const mockFetch = (data: unknown) =>
	Promise.resolve({
		ok: true,
		json: () => Promise.resolve(data),
	} as Response);

describe("CurrencyExchange with TanStack Query", () => {
	let fx: CurrencyExchangeService;
	let originalFetch: typeof global.fetch;

	beforeEach(() => {
		fx = new CurrencyExchangeService();
		originalFetch = global.fetch;
		global.fetch = jest.fn(() =>
			mockFetch({
				base: "USD",
				rates: { EUR: 0.92, GBP: 0.79, JPY: 150.5 },
			}),
		);
	});

	afterEach(() => {
		fx.destroy();
		global.fetch = originalFetch;
	});

	test("initial state has NO rates — nothing fetched yet", () => {
		// No hardcoded fallback table: a stale made-up rate presented as a
		// real conversion is worse than a Pending state.
		expect(fx.getAllRates()).toBeNull();
		expect(fx.hasRates()).toBe(false);
	});

	test("getRate fetches from API", async () => {
		const rate = await fx.getRate("USD", "EUR");
		expect(rate).toBe(0.92);
	});

	test("getRateSync returns null before any fetch, live rate after", async () => {
		// Before a fetch there is no data — sync lookup must not invent one.
		expect(fx.getRateSync("USD", "EUR")).toBeNull();

		// A successful fetch makes the pair available synchronously
		// within the freshness window.
		await fx.getRate("USD", "EUR");
		expect(fx.getRateSync("USD", "EUR")).toBe(0.92);
	});

	test("getRateSync returns 1 for same currency", () => {
		expect(fx.getRateSync("USD", "USD")).toBe(1);
		expect(fx.getRateSync("EUR", "EUR")).toBe(1);
	});

	test("convert returns converted value", async () => {
		const result = await fx.convert(100, "USD", "EUR");
		expect(result).toBe(92); // 100 * 0.92
	});

	test("isCurrency returns true for known currencies", () => {
		expect(fx.isCurrency("usd")).toBe(true);
		expect(fx.isCurrency("eur")).toBe(true);
		expect(fx.isCurrency("xyz")).toBe(false);
	});

	test("getRateSync triangulates cross pairs through a fetched base table", async () => {
		// One USD-base fetch caches EUR and GBP — the EUR→GBP cross pair
		// resolves synchronously via triangulation: 0.79 / 0.92.
		await fx.getRate("USD", "EUR");
		const rate = fx.getRateSync("EUR", "GBP");
		expect(rate).not.toBeNull();
		expect(rate).toBeCloseTo(0.79 / 0.92, 5);
	});

	test("convertSync uses live rates after a fetch, null before", async () => {
		expect(fx.convertSync(100, "USD", "EUR")).toBeNull();

		await fx.getRate("USD", "EUR");
		const result = fx.convertSync(100, "USD", "EUR");
		expect(result).not.toBeNull();
		expect(result).toBeCloseTo(92, 5); // Live: 100 * 0.92
	});

	test("convertSync returns null for unknown currencies", () => {
		const result = fx.convertSync(100, "USD", "XYZ");
		expect(result).toBeNull();
	});

	test("getRateSync returns null for unknown currencies", () => {
		const rate = fx.getRateSync("USD", "XYZ");
		expect(rate).toBeNull();
	});

	test("hasRates reflects whether fresh live rates are cached", async () => {
		expect(fx.hasRates()).toBe(false);
		await fx.getRate("USD", "EUR");
		expect(fx.hasRates()).toBe(true);
	});

	test("fetch aborts when signal fires", async () => {
		const controller = new AbortController();
		controller.abort();

		// Mock fetch to throw AbortError
		global.fetch = jest.fn(() => Promise.reject(new DOMException("Aborted", "AbortError")));

		await expect(fx.getRate("USD", "EUR", controller.signal)).rejects.toThrow();
	});
});
