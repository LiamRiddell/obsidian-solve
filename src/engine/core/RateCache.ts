/**
 * Interface for caching exchange rates with nullable support
 */
export interface RateCache {
	/**
	 * Get a rate from the cache.
	 * @param fromCurrency - Source currency code
	 * @param toCurrency - Target currency code
	 * @returns The exchange rate or null if not found
	 */
	getRate(fromCurrency: string, toCurrency: string): number | null;

	/**
	 * Set a rate in the cache.
	 * @param fromCurrency - Source currency code
	 * @param toCurrency - Target currency code
	 * @param rate - The exchange rate
	 */
	setRate(fromCurrency: string, toCurrency: string, rate: number): void;

	/**
	 * Get all rates for a base currency.
	 * @param baseCurrency - The base currency code
	 * @returns Record of target currency to rate, or null if not available
	 */
	getRates(baseCurrency: string): Record<string, number> | null;

	/**
	 * Set all rates for a base currency.
	 * @param baseCurrency - The base currency code
	 * @param rates - Record of target currency to rate
	 */
	setRates(baseCurrency: string, rates: Record<string, number>): void;

	/**
	 * Clear all cached rates.
	 */
	clear(): void;

	/**
	 * Check if a currency code is known.
	 * @param currency - Currency code to check
	 * @returns True if currency is known
	 */
	isKnownCurrency(currency: string): boolean;

	/**
	 * Check if cache has data for a base currency.
	 * @param baseCurrency - The base currency code
	 * @returns True if cache has data
	 */
	hasData(baseCurrency: string): boolean;
}

/**
 * In-memory implementation of RateCache with nullable support
 */
export class InMemoryRateCache implements RateCache {
	private rates: Map<string, Map<string, number>> = new Map();

	/**
	 * Get a rate from the cache.
	 */
	getRate(fromCurrency: string, toCurrency: string): number | null {
		const fromUpper = fromCurrency.toUpperCase();
		const toUpper = toCurrency.toUpperCase();
		const fromMap = this.rates.get(fromUpper);
		return fromMap?.get(toUpper) ?? null;
	}

	/**
	 * Set a rate in the cache.
	 */
	setRate(fromCurrency: string, toCurrency: string, rate: number): void {
		const fromUpper = fromCurrency.toUpperCase();
		const toUpper = toCurrency.toUpperCase();
		if (!this.rates.has(fromUpper)) {
			this.rates.set(fromUpper, new Map());
		}
		this.rates.get(fromUpper)!.set(toUpper, rate);
	}

	/**
	 * Get all rates for a base currency.
	 */
	getRates(baseCurrency: string): Record<string, number> | null {
		const baseUpper = baseCurrency.toUpperCase();
		const fromMap = this.rates.get(baseUpper);
		if (!fromMap) return null;

		const result: Record<string, number> = {};
		fromMap.forEach((rate, currency) => {
			result[currency] = rate;
		});
		return result;
	}

	/**
	 * Set all rates for a base currency.
	 */
	setRates(baseCurrency: string, rates: Record<string, number>): void {
		const baseUpper = baseCurrency.toUpperCase();
		const fromMap = new Map<string, number>();
		Object.entries(rates).forEach(([currency, rate]) => {
			fromMap.set(currency.toUpperCase(), rate);
		});
		this.rates.set(baseUpper, fromMap);
	}

	/**
	 * Clear all cached rates.
	 */
	clear(): void {
		this.rates.clear();
	}

	/**
	 * Check if a currency code is known.
	 */
	isKnownCurrency(currency: string): boolean {
		const upper = currency.toUpperCase();
		// Check if it's a base currency
		if (this.rates.has(upper)) return true;
		// Check if it's a target currency in any base
		for (const baseMap of this.rates.values()) {
			if (baseMap.has(upper)) return true;
		}
		return false;
	}

	/**
	 * Check if cache has data for a base currency.
	 */
	hasData(baseCurrency: string): boolean {
		return this.rates.has(baseCurrency.toUpperCase());
	}
}
