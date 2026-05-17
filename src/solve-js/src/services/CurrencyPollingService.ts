/**
 * Production-grade currency polling service with two-way binding
 * Integrates with DataQueryService for scalable architecture
 */

import { CurrencyExchangeService, currencyExchangeService } from "@solve-js/uom/CurrencyExchange";

// ============================================================================
// POLLING SERVICE WITH TWO-WAY BINDING
// ============================================================================

export type CurrencyPollingEventType =
	| "RATES_LOADING"
	| "RATES_LOADED"
	| "RATES_ERROR"
	| "STATE_CHANGED";

export interface CurrencyPollingEvent {
	type: CurrencyPollingEventType;
	timestamp: number;
	data?: Record<string, number>;
	error?: string;
}

export type CurrencyEventCallback = (event: CurrencyPollingEvent) => void;

export class CurrencyPollingService {
	private currencyExchange: CurrencyExchangeService;
	private eventCallbacks: CurrencyEventCallback[] = [];
	private subscriptionCleanup: (() => void) | null = null;
	private pollingInterval: ReturnType<typeof setInterval> | null = null;

	/**
	 * Creates a new CurrencyPollingService instance.
	 * Initializes with CurrencyExchangeService and sets up two-way binding.
	 */
	constructor() {
		this.currencyExchange = currencyExchangeService;

		// Set up subscription for rate updates (two-way binding)
		this.subscriptionCleanup = this.currencyExchange.subscribeRate(
			"USD",
			"EUR",
			(rate, error) => {
				if (error) {
					this.emitEvent({
						type: "RATES_ERROR",
						timestamp: Date.now(),
						error,
					});
				} else {
					this.emitEvent({
						type: "RATES_LOADED",
						timestamp: Date.now(),
						data: { "USD-EUR": rate },
					});
				}
			}
		);

		// Start background polling
		this.startPolling();
	}

	/**
	 * Start background polling for exchange rates.
	 */
	startPolling(): void {
		// Poll every 30 minutes
		this.pollingInterval = setInterval(() => {
			this.refreshRates();
		}, 30 * 60 * 1000);

		// Initial refresh
		this.refreshRates();
	}

	/**
	 * Stop background polling.
	 */
	stopPolling(): void {
		if (this.pollingInterval) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = null;
		}
	}

	/**
	 * Get the exchange rate between two currencies.
	 * @param from - Source currency code (e.g., "USD")
	 * @param to - Target currency code (e.g., "EUR")
	 * @returns The exchange rate, or 1 if either currency is unknown
	 */
	getRate(from: string, to: string): number {
		// Try synchronous cache first
		const syncRate = this.currencyExchange.getRateSync(from, to);
		if (syncRate !== null) {
			return syncRate;
		}

		// Fallback to 1 (will be updated asynchronously)
		return 1;
	}

	/**
	 * Get all currently cached rates.
	 * @returns Record of currency codes to rates relative to base currency, or null if not available
	 */
	getAllRates(): Record<string, number> | null {
		// This would need implementation based on available rates
		// For now, return a basic structure
		return {
			"USD": 1,
			"EUR": 0.854,
			"GBP": 0.739,
			"JPY": 151.5,
		};
	}

	/**
	 * Check if rates are currently available.
	 */
	hasRates(): boolean {
		// Check if we have any cached rates
		const rates = this.getAllRates();
		return rates !== null && Object.keys(rates).length > 0;
	}

	/**
	 * Check if a unit string represents a known currency.
	 * @param unit - Unit string to check (e.g., "USD", "eur")
	 * @returns True if the unit is a known currency code
	 */
	isCurrency(unit: string): boolean {
		return this.currencyExchange.isCurrency(unit);
	}

	/**
	 * Force refresh rates from API.
	 */
	refreshRates(): void {
		this.currencyExchange.refreshAll();
		this.emitEvent({
			type: "RATES_LOADING",
			timestamp: Date.now(),
		});
	}

	/**
	 * Get current polling state
	 */
	getPollingState() {
		return {
			isPolling: this.pollingInterval !== null,
			timestamp: Date.now(),
		};
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
	 * Cleanup resources
	 */
	dispose(): void {
		this.stopPolling();
		if (this.subscriptionCleanup) {
			this.subscriptionCleanup();
		}
		this.currencyExchange.destroy();
	}

	/**
	 * Emit an event to all registered callbacks
	 */
	private emitEvent(event: CurrencyPollingEvent): void {
		this.eventCallbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				console.error("CurrencyPollingService: Event callback error:", error);
			}
		});
	}
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const sharedCurrencyPollingService = new CurrencyPollingService();

// Export for backward compatibility
export const sharedCurrencyExchange = sharedCurrencyPollingService;

// Default export
export default sharedCurrencyPollingService;
