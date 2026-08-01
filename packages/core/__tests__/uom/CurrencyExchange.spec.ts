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

/**
 * Bug: BTC/ETH/etc. were accepted by isCurrency() and tokenized as UNIT
 * (see units.ts) but had no actual price source — getRate() routed every
 * request through Frankfurter, a fiat-only ECB rate API with no concept
 * of "base=BTC". Every crypto conversion failed at the network layer no
 * matter what, which (combined with two separate VM/preflight bugs fixed
 * alongside this) surfaced as "0.01 BTC + 1 ETH" silently evaluating to
 * a bare unitless "1.01" instead of doing anything crypto-aware.
 *
 * Fix: crypto codes now route through CoinGecko's no-auth simple-price
 * endpoint instead, covering all three directions (crypto→crypto,
 * crypto→fiat, fiat→crypto) via a common "price in one currency" call.
 */
describe("CurrencyExchange crypto support", () => {
	let fx: CurrencyExchangeService;
	let originalFetch: typeof global.fetch;

	beforeEach(() => {
		fx = new CurrencyExchangeService();
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("isCurrency recognizes crypto codes", () => {
		expect(fx.isCurrency("btc")).toBe(true);
		expect(fx.isCurrency("ETH")).toBe(true);
		expect(fx.isCurrency("DOGE")).toBe(true);
	});

	test("getRate for crypto->crypto calls CoinGecko, not Frankfurter, and computes a USD cross rate", async () => {
		const fetchMock = jest.fn((url: string) =>
			mockFetch({ bitcoin: { usd: 60000 }, ethereum: { usd: 3000 } }),
		);
		global.fetch = fetchMock as unknown as typeof fetch;

		const rate = await fx.getRate("BTC", "ETH");

		expect(rate).toBeCloseTo(60000 / 3000, 10);
		const calledUrl = (fetchMock.mock.calls[0] as unknown[])[0] as string;
		expect(calledUrl).toContain("coingecko.com");
		expect(calledUrl).not.toContain("frankfurter");
		expect(calledUrl).toContain("ids=bitcoin,ethereum");
	});

	test("getRate for crypto->fiat fetches the coin's price directly in that fiat currency", async () => {
		global.fetch = jest.fn(() => mockFetch({ bitcoin: { eur: 55000 } })) as unknown as typeof fetch;

		const rate = await fx.getRate("BTC", "EUR");

		expect(rate).toBe(55000);
	});

	test("getRate for fiat->crypto inverts the coin's price in that fiat currency", async () => {
		global.fetch = jest.fn(() => mockFetch({ ethereum: { usd: 2500 } })) as unknown as typeof fetch;

		const rate = await fx.getRate("USD", "ETH");

		expect(rate).toBeCloseTo(1 / 2500, 10);
	});

	test("a fetched crypto rate is served synchronously afterward, same as fiat", async () => {
		global.fetch = jest.fn(() => mockFetch({ bitcoin: { usd: 60000 }, ethereum: { usd: 3000 } })) as unknown as typeof fetch;

		expect(fx.getRateSync("BTC", "ETH")).toBeNull();
		await fx.getRate("BTC", "ETH");
		expect(fx.getRateSync("BTC", "ETH")).toBeCloseTo(20, 5);
		expect(fx.convertSync(2, "BTC", "ETH")).toBeCloseTo(40, 5);
	});

	test("unknown coin id surfaces a clear error rather than a silent bad rate", async () => {
		global.fetch = jest.fn(() => mockFetch({})) as unknown as typeof fetch; // API returned nothing for either coin
		await expect(fx.getRate("BTC", "ETH")).rejects.toThrow(/Unknown currency/);
	});
});
