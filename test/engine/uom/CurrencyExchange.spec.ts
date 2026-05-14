import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import { CurrencyExchange, CurrencyEvent } from "@/engine/uom/CurrencyExchange";

describe("CurrencyExchange with TanStack Query", () => {
	let fx: CurrencyExchange;

	beforeEach(() => {
		fx = new CurrencyExchange();
	});

	afterEach(() => {
		fx.stopPolling();
	});

	test("initial state is null (no rates available)", () => {
		expect(fx.getAllRates()).toBeNull();
		expect(fx.hasRates()).toBe(false);
	});

	test("getRate returns 1 when no rates available", () => {
		expect(fx.getRate("USD", "EUR")).toBe(1);
	});

	test("convert returns input value when no rates available", () => {
		expect(fx.convert(100, "USD", "EUR")).toBe(100);
	});

	test("isCurrency returns false when no rates available", () => {
		expect(fx.isCurrency("usd")).toBe(false);
		expect(fx.isCurrency("eur")).toBe(false);
	});

	test("refreshRates triggers non-blocking fetch", async () => {
		const mockFetch = jest.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => [
				{ base: "USD", quote: "EUR", rate: 0.9 },
				{ base: "USD", quote: "GBP", rate: 0.8 },
			],
		}));
		(global as any).fetch = mockFetch;

		fx.refreshRates();

		// Should return immediately (non-blocking)
		expect(mockFetch).toHaveBeenCalled();

		// Wait for async operation to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Now rates should be available
		expect(fx.hasRates()).toBe(true);
		expect(fx.getRate("USD", "EUR")).toBeCloseTo(0.9, 2);
	});

	test("event callback is called on state changes", async () => {
		const mockFetch = jest.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => [
				{ base: "USD", quote: "EUR", rate: 0.9 },
			],
		}));
		(global as any).fetch = mockFetch;

		const eventCallback = jest.fn();
		fx.onEvent(eventCallback);

		fx.refreshRates();
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should have received events
		expect(eventCallback).toHaveBeenCalled();

		// Should have received RATES_LOADED event
		const loadedEvent = eventCallback.mock.calls.find(
			(call: any) => call[0].type === "RATES_LOADED"
		);
		expect(loadedEvent).toBeDefined();
	});

		test("loading state is tracked correctly", async () => {
		const loadingStates: boolean[] = [];
		const eventCallback = jest.fn((event: CurrencyEvent) => {
			if (event.type === "RATES_LOADING") {
				loadingStates.push(true);
			} else if (event.type === "RATES_LOADED") {
				loadingStates.push(false);
			}
		});
		fx.onEvent(eventCallback);

		const mockFetch = jest.fn().mockImplementation(async () => {
			// Simulate slow network
			await new Promise((resolve) => setTimeout(resolve, 50));
			return {
				ok: true,
				json: async () => [
					{ base: "USD", quote: "EUR", rate: 0.9 },
				],
			};
		});
		(global as any).fetch = mockFetch;

		expect(loadingStates).not.toContain(true);

		fx.refreshRates();

		// Should have received loading event
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(loadingStates).toContain(true);

		// Wait for operation to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should have received loaded event
		expect(loadingStates).toContain(false);
	});

	test("getRate works after rates are loaded", async () => {
		const mockFetch = jest.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => [
				{ base: "USD", quote: "EUR", rate: 0.9 },
				{ base: "USD", quote: "GBP", rate: 0.8 },
				{ base: "USD", quote: "JPY", rate: 150 },
			],
		}));
		(global as any).fetch = mockFetch;

		fx.refreshRates();
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Same currency
		expect(fx.getRate("USD", "USD")).toBe(1);

		// Convert USD to EUR
		expect(fx.getRate("USD", "EUR")).toBeCloseTo(0.9, 2);

		// Convert EUR to USD (inverted)
		expect(fx.getRate("EUR", "USD")).toBeCloseTo(1 / 0.9, 2);

		// Convert GBP to JPY (cross rate)
		const jpyRate = fx.getRate("GBP", "JPY");
		expect(jpyRate).toBeGreaterThan(100); // JPY is a low-value currency
	});

	test("isCurrency returns true for known currencies after loading", async () => {
		const mockFetch = jest.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => [
				{ base: "USD", quote: "EUR", rate: 0.9 },
			],
		}));
		(global as any).fetch = mockFetch;

		fx.refreshRates();
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(fx.isCurrency("usd")).toBe(true);
		expect(fx.isCurrency("eur")).toBe(true);
		expect(fx.isCurrency("xyz")).toBe(false);
	});

	test("error handling - keeps existing rates on fetch error", async () => {
		// First, load some rates successfully
		const mockFetchSuccess = jest.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => [
				{ base: "USD", quote: "EUR", rate: 0.9 },
			],
		}));
		(global as any).fetch = mockFetchSuccess;

		fx.refreshRates();
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(fx.hasRates()).toBe(true);
		expect(fx.getRate("USD", "EUR")).toBeCloseTo(0.9, 2);

		// Now simulate an error
		const mockFetchError = jest.fn().mockImplementation(async () => {
			throw new Error("Network error");
		});
		(global as any).fetch = mockFetchError;

		fx.refreshRates();
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should keep existing rates
		expect(fx.hasRates()).toBe(true);
		expect(fx.getRate("USD", "EUR")).toBeCloseTo(0.9, 2);
	});

		test("event-driven loading indicator", async () => {
		const loadingStates: boolean[] = [];
		const eventCallback = jest.fn((event: CurrencyEvent) => {
			if (event.type === "RATES_LOADING") {
				loadingStates.push(true);
			} else if (event.type === "RATES_LOADED") {
				loadingStates.push(false);
			}
		});
		fx.onEvent(eventCallback);

		const mockFetch = jest.fn().mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return {
				ok: true,
				json: async () => [
					{ base: "USD", quote: "EUR", rate: 0.9 },
				],
			};
		});
		(global as any).fetch = mockFetch;

		fx.refreshRates();

		// Wait for operation to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should have received loading started then stopped
		expect(loadingStates).toContain(true);
		expect(loadingStates).toContain(false);
		expect(loadingStates[0]).toBe(true); // First event should be loading
	});
});
