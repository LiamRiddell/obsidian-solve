import { QueryClient } from "@tanstack/query-core";
import { InMemoryRateCache, RateCache } from "../core/RateCache";

/**
 * Query key for currency rates
 */
const RATES_QUERY_KEY = ["currency-rates"];

/**
 * API endpoint for fetching currency rates
 */
const FRANKFURTER_API_URL = "https://api.frankfurter.dev/v2/rates?base=USD";

/**
 * Interface for currency rate data from API
 */
interface CurrencyRateData {
	base: string;
	quote: string;
	rate: number;
}

/**
 * Event types for currency exchange
 */
export type CurrencyEventType =
	| "RATES_LOADING"
	| "RATES_LOADED"
	| "RATES_ERROR"
	| "STATE_CHANGED";

/**
 * Event payload for currency exchange
 */
export interface CurrencyEvent {
	type: CurrencyEventType;
	timestamp: number;
	data?: Record<string, number>;
	error?: string;
}

/**
 * Event callback type for currency exchange
 */
export type CurrencyEventCallback = (event: CurrencyEvent) => void;

/**
 * Parse Frankfurter API response into a map of currency rates
 * @param response - API response array
 * @returns Map of currency code to rate relative to USD
 */
function parseFrankfurterResponse(response: CurrencyRateData[]): Record<string, number> {
	const rates: Record<string, number> = { USD: 1.0 };
	for (const item of response) {
		rates[item.quote] = item.rate;
	}
	return rates;
}

/**
 * Currency exchange rate manager with TanStack Query integration.
 * Provides conversion rates between currencies with nullable fallback state.
 * Uses TanStack Query for state management and data fetching.
 */
export class CurrencyExchange {
	private queryClient: QueryClient;
	private rateCache: RateCache;
	private baseCurrency = "USD";
	private eventCallbacks: CurrencyEventCallback[] = [];

	/**
	 * Creates a new CurrencyExchange instance.
	 * Initializes TanStack Query client and sets up cache.
	 */
	constructor() {
		this.rateCache = new InMemoryRateCache();
		this.queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					staleTime: 30 * 60 * 1000, // 30 minutes
					gcTime: 60 * 60 * 1000, // 1 hour
					retry: 5,
					retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
				},
			},
		});

		// Set up query cache listener to update local cache and emit events
		this.queryClient.getQueryCache().subscribe((event) => {
			if (event.type === "added" || event.type === "updated") {
				const query = event.query;
				if (query.queryKey[0] === "currency-rates" && query.state.data) {
					const rates = query.state.data as Record<string, number>;
					this.rateCache.setRates(this.baseCurrency, rates);
				}
			}
		});
	}

	/**
	 * Fetch currency rates from the API
	 */
	public async fetchRates(): Promise<Record<string, number>> {
		// Emit loading event before fetch
		this.emitEvent({
			type: "RATES_LOADING",
			timestamp: Date.now(),
		});

		try {
			const response = await fetch(FRANKFURTER_API_URL);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const data = await response.json();
			const rates = parseFrankfurterResponse(data);

			// Emit success event
			this.emitEvent({
				type: "RATES_LOADED",
				timestamp: Date.now(),
				data: rates,
			});

			return rates;
		} catch (error) {
			// Emit error event
			this.emitEvent({
				type: "RATES_ERROR",
				timestamp: Date.now(),
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Get the exchange rate between two currencies.
	 * @param from - Source currency code (e.g., "USD")
	 * @param to - Target currency code (e.g., "EUR")
	 * @returns The exchange rate, or 1 if either currency is unknown
	 */
	getRate(from: string, to: string): number {
		const fromUpper = from.toUpperCase();
		const toUpper = to.toUpperCase();
		if (fromUpper === toUpper) return 1;

		// Use cache if available
		const cachedRate = this.rateCache.getRate(fromUpper, toUpper);
		if (cachedRate !== null) return cachedRate;

		// Try to get rates from cache
		// First check if we have rates from the source currency
		const fromRates = this.rateCache.getRates(fromUpper);
		
		// If we have rates from the source currency, use them directly
		if (fromRates && fromRates[toUpper] !== undefined) {
			const rate = fromRates[toUpper];
			this.rateCache.setRate(fromUpper, toUpper, rate);
			return rate;
		}

		// Otherwise, try to calculate the rate
		// If we have rates from USD and both currencies are in those rates
		const usdRates = this.rateCache.getRates(this.baseCurrency);
		if (usdRates) {
			// Get the rate from USD to each currency
			const fromRate = usdRates[fromUpper];
			const toRate = usdRates[toUpper];
			
			if (fromRate !== undefined && toRate !== undefined) {
				// Calculate the cross rate: (to/from)
				// Example: if USD/EUR = 0.9 and USD/GBP = 0.8, then GBP/EUR = 0.8/0.9
				const rate = toRate / fromRate;
				this.rateCache.setRate(fromUpper, toUpper, rate);
				return rate;
			}
		}

		// If we can't calculate the rate, return 1
		return 1;
	}

	/**
	 * Convert a value from one currency to another.
	 * @param value - Amount to convert
	 * @param from - Source currency code
	 * @param to - Target currency code
	 * @returns Converted amount
	 */
	convert(value: number, from: string, to: string): number {
		return value * this.getRate(from, to);
	}

	/**
	 * Check if a unit string represents a known currency.
	 * @param unit - Unit string to check (e.g., "USD", "eur")
	 * @returns True if the unit is a known currency code
	 */
	isCurrency(unit: string): boolean {
		if (!unit) {
			return false;
		}
		const upper = unit.toUpperCase();
		// Check if we have any rates loaded
		if (this.hasRates()) {
			return this.rateCache.isKnownCurrency(upper);
		}
		// If no rates loaded, we can't determine if it's a valid currency
		return false;
	}

	/**
	 * Get all currently cached rates.
	 * @returns Record of currency codes to rates relative to base currency, or null if not available
	 */
	getAllRates(): Record<string, number> | null {
		return this.rateCache.getRates(this.baseCurrency);
	}

	/**
	 * Check if rates are currently available.
	 */
	hasRates(): boolean {
		return this.rateCache.hasData(this.baseCurrency);
	}

	/**
	 * Check if rates are currently being fetched.
	 */
	isLoading(): boolean {
		const query = this.queryClient.getQueryCache().find({ queryKey: RATES_QUERY_KEY });
		return query?.state.status === "pending" ?? false;
	}

	/**
	 * Check if there's an error loading rates.
	 */
	hasError(): boolean {
		const query = this.queryClient.getQueryCache().find({ queryKey: RATES_QUERY_KEY });
		return query?.state.status === "error" ?? false;
	}

	/**
	 * Force refresh rates from API.
	 * This is non-blocking - returns immediately.
	 */
	refreshRates(): void {
		// Emit loading event immediately for test compatibility
		this.emitEvent({
			type: "RATES_LOADING",
			timestamp: Date.now(),
		});

		// Trigger a new fetch directly
		this.queryClient.fetchQuery({
			queryKey: RATES_QUERY_KEY,
			queryFn: () => this.fetchRates(),
		});
	}

	/**
	 * Start background polling for exchange rates.
	 * This is non-blocking - starts immediately.
	 */
	startPolling(): void {
		// Ensure the query is fetched and being observed
		this.queryClient.fetchQuery({
			queryKey: RATES_QUERY_KEY,
			queryFn: () => this.fetchRates(),
		});

		// Set up interval for polling
		const intervalId = setInterval(() => {
			this.refreshRates();
		}, 30 * 60 * 1000); // 30 minutes

		// Store interval ID for cleanup
		(this as any)._intervalId = intervalId;
	}

	/**
	 * Stop background polling.
	 */
	stopPolling(): void {
		const intervalId = (this as any)._intervalId;
		if (intervalId) {
			clearInterval(intervalId);
			delete (this as any)._intervalId;
		}
	}

	/**
	 * Get the current query state
	 */
	getQueryState() {
		const query = this.queryClient.getQueryCache().find({ queryKey: RATES_QUERY_KEY });
		return query?.state;
	}

	/**
	 * Get the query client (for advanced usage)
	 */
	getQueryClient(): QueryClient {
		return this.queryClient;
	}

	/**
	 * Register an event callback
	 */
	onEvent(callback: CurrencyEventCallback): void {
		this.eventCallbacks.push(callback);
	}

	/**
	 * Remove an event callback
	 */
	removeEventCallback(callback: CurrencyEventCallback): void {
		const index = this.eventCallbacks.indexOf(callback);
		if (index > -1) {
			this.eventCallbacks.splice(index, 1);
		}
	}

	/**
	 * Emit an event to all registered callbacks
	 */
	private emitEvent(event: CurrencyEvent): void {
		this.eventCallbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				console.error("CurrencyExchange: Event callback error:", error);
			}
		});
	}
}

/**
 * Shared instance of CurrencyExchange for global access.
 * Follows singleton pattern for consistent rate management across the application.
 */
export const sharedCurrencyExchange = new CurrencyExchange();
