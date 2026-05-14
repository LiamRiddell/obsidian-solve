import { CurrencyExchange } from "./CurrencyExchange";
import { QueryObserver } from "@tanstack/query-core";

/**
 * Event types for currency polling service
 */
export type CurrencyPollingEventType =
	| "RATES_LOADING"
	| "RATES_LOADED"
	| "RATES_ERROR"
	| "STATE_CHANGED";

/**
 * Event payload for currency polling
 */
export interface CurrencyPollingEvent {
	type: CurrencyPollingEventType;
	timestamp: number;
	data?: Record<string, number>;
	error?: string;
}

/**
 * Event callback type for currency polling
 */
export type CurrencyEventCallback = (event: CurrencyPollingEvent) => void;

/**
 * Service for managing currency polling operations.
 * Handles polling lifecycle, rate caching, and event-driven updates.
 */
export class CurrencyPollingService {
	private currencyExchange: CurrencyExchange;
	private observer: QueryObserver<Record<string, number>> | null = null;
	private eventCallbacks: CurrencyEventCallback[] = [];
	private unsubscribe: (() => void) | null = null;

	/**
	 * Creates a new CurrencyPollingService instance.
	 * Initializes with CurrencyExchange and sets up query observer.
	 */
	constructor() {
		this.currencyExchange = new CurrencyExchange();

		// Set up query observer for reactive updates
		const queryClient = this.currencyExchange.getQueryClient();
		this.observer = new QueryObserver(queryClient, {
			queryKey: ["currency-rates"],
			queryFn: async () => {
				// This will be handled by the CurrencyExchange's fetchRates method
				// We'll trigger it through the exchange
				const result = await this.currencyExchange.fetchRates();
				return result;
			},
			staleTime: 30 * 60 * 1000, // 30 minutes
			gcTime: 60 * 60 * 1000, // 1 hour
			retry: 5,
			retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
		});

		// Subscribe to observer updates
		this.unsubscribe = this.observer.subscribe((result) => {
			if (result.status === "pending") {
				this.emitEvent({
					type: "RATES_LOADING",
					timestamp: Date.now(),
				});
			} else if (result.status === "success" && result.data) {
				this.emitEvent({
					type: "RATES_LOADED",
					timestamp: Date.now(),
					data: result.data,
				});
			} else if (result.status === "error") {
				this.emitEvent({
					type: "RATES_ERROR",
					timestamp: Date.now(),
					error: result.error?.message,
				});
			}

			// Always emit state change
			this.emitEvent({
				type: "STATE_CHANGED",
				timestamp: Date.now(),
			});
		});
	}

	/**
	 * Start background polling for exchange rates.
	 */
	startPolling(): void {
		this.currencyExchange.startPolling();
	}

	/**
	 * Stop background polling.
	 */
	stopPolling(): void {
		this.currencyExchange.stopPolling();
	}

	/**
	 * Get the exchange rate between two currencies.
	 * @param from - Source currency code (e.g., "USD")
	 * @param to - Target currency code (e.g., "EUR")
	 * @returns The exchange rate, or 1 if either currency is unknown
	 */
	getRate(from: string, to: string): number {
		return this.currencyExchange.getRate(from, to);
	}

	/**
	 * Get all currently cached rates.
	 * @returns Record of currency codes to rates relative to base currency, or null if not available
	 */
	getAllRates(): Record<string, number> | null {
		return this.currencyExchange.getAllRates();
	}

	/**
	 * Check if rates are currently available.
	 */
	hasRates(): boolean {
		return this.currencyExchange.hasRates();
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
		this.currencyExchange.refreshRates();
	}

	/**
	 * Get current polling state
	 */
	getPollingState() {
		return this.currencyExchange.getQueryState();
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
		if (this.unsubscribe) {
			this.unsubscribe();
		}
		this.currencyExchange.stopPolling();
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
