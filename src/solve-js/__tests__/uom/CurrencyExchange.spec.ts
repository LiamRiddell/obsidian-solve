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

	test("initial state has fallback rates", () => {
		const rates = fx.getAllRates();
		expect(rates).not.toBeNull();
		expect(rates).toHaveProperty("USD", 1);
	});

	test("getRate fetches from API", async () => {
		const rate = await fx.getRate("USD", "EUR");
		expect(rate).toBe(0.92);
	});

	test("getRateSync returns fallback rate (without needing fetch)", () => {
		// Fallback rates: EUR = 0.854, USD = 1 → EUR/USD = 0.854
		const rate = fx.getRateSync("USD", "EUR");
		expect(rate).not.toBeNull();
		expect(rate).toBe(0.854);
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

	test("getRateSync works with fallback rates", () => {
		const rate = fx.getRateSync("USD", "EUR");
		expect(rate).not.toBeNull();
		expect(rate).toBeGreaterThan(0);
	});

	test("convertSync works with fallback rates", () => {
		const result = fx.convertSync(100, "USD", "EUR");
		expect(result).not.toBeNull();
		expect(result).toBeCloseTo(85.4, 1); // Fallback: 100 * 0.854 ≈ 85.4
	});

	test("convertSync returns null for unknown currencies", () => {
		const result = fx.convertSync(100, "USD", "XYZ");
		expect(result).toBeNull();
	});

	test("getRateSync returns null for unknown currencies", () => {
		const rate = fx.getRateSync("USD", "XYZ");
		expect(rate).toBeNull();
	});

	test("hasRates returns true (fallback rates always available)", () => {
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
