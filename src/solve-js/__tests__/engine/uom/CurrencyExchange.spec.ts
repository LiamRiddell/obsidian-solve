import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { CurrencyExchangeService } from "@solve-js/uom/CurrencyExchange";
import { dataQueryService } from "@solve-js/services/DataQueryService";

describe("CurrencyExchange with TanStack Query", () => {
	let fx: CurrencyExchangeService;

	beforeEach(() => {
		// Use main thread execution for tests (no worker)
		(dataQueryService as any).config.useWorker = false;
		
		// Create a new service instance for each test
		fx = new CurrencyExchangeService();
	});

	afterEach(() => {
		fx.destroy();
	});

	test("initial state has fallback rates", () => {
		// With the new architecture, we have fallback rates
		const rates = fx.getAllRates();
		expect(rates).not.toBeNull();
		expect(rates).toHaveProperty("USD", 1);
	});

	test("getRateSync returns cached rate", async () => {
		// Pre-populate cache
		await fx.getRate("USD", "EUR");
		const rate = fx.getRateSync("USD", "EUR");
		expect(rate).not.toBeNull();
	});

	test("convert returns converted value", async () => {
		// Pre-populate cache
		const result = await fx.convert(100, "USD", "EUR");
		expect(result).toBeGreaterThan(0);
	});

	test("isCurrency returns true for known currencies", () => {
		expect(fx.isCurrency("usd")).toBe(true);
		expect(fx.isCurrency("eur")).toBe(true);
		expect(fx.isCurrency("xyz")).toBe(false);
	});

	test("getRate works with fallback rates", async () => {
		// With fallback rates, we should get a rate immediately
		const rate = fx.getRateSync("USD", "EUR");
		expect(rate).not.toBeNull();
		expect(rate).toBeGreaterThan(0);
	});

	test("convertSync works with cached rates", async () => {
		// Get a rate to populate cache
		await fx.getRate("USD", "EUR");
		
		// Now use sync conversion
		const result = fx.convertSync(100, "USD", "EUR");
		expect(result).not.toBeNull();
		expect(result).toBeGreaterThan(0);
	});
});
