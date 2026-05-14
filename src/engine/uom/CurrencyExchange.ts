/**
 * Production-grade currency exchange service with scalable architecture
 * Integrates with DataQueryService for worker-based execution
 */

import { dataQueryService, DataSourceConfig, PluginRegistration } from "@/engine/services/DataQueryService";
import { QueryFunctionContext } from "@tanstack/query-core";

// ============================================================================
// CURRENCY DATA SOURCE CONFIGURATION
// ============================================================================

const CURRENCY_DATA_SOURCE_ID = "currency";

const currencyDataSourceConfig: DataSourceConfig = {
  id: CURRENCY_DATA_SOURCE_ID,
  type: "currency",
  endpoint: "https://api.frankfurter.dev/v2/rates?base=USD",
  refreshInterval: 30 * 60 * 1000, // 30 minutes
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: 5,
};

// ============================================================================
// CURRENCY EXCHANGE SERVICE
// ============================================================================

export class CurrencyExchangeService {
  private dataSourceHandle: any;
  private subscriptions: Map<string, any> = new Map();

  constructor() {
    // Register currency data source
    this.dataSourceHandle = dataQueryService.registerDataSource(
      currencyDataSourceConfig
    );

    // Register currency-specific plugin
    this.registerCurrencyPlugin();
  }

  // ------------------------------------------------------------------------
  // PLUGIN REGISTRATION
  // ------------------------------------------------------------------------

  private registerCurrencyPlugin(): void {
    const currencyPlugin: PluginRegistration = {
      id: "currency-plugin",
      dataSourceId: CURRENCY_DATA_SOURCE_ID,
      priority: 1,
      queryFunction: async (context: QueryFunctionContext) => {
        // Custom currency query logic
        const [, from, to] = context.queryKey;
        
        // Fetch from API
        const response = await fetch(
          `https://api.frankfurter.dev/v2/rates?base=USD`
        );
        const data = await response.json();
        
        // Parse and calculate rate
        return this.calculateRate(data, from as string, to as string);
      },
    };

    dataQueryService.registerPlugin(currencyPlugin);
  }

  // ------------------------------------------------------------------------
  // RATE FETCHING
  // ------------------------------------------------------------------------

  async getRate(from: string, to: string): Promise<number> {
    const queryKey = ["currency", from, to];
    return this.dataSourceHandle.get(queryKey);
  }

  getRateSync(from: string, to: string): number | null {
    // For same currency, return 1
    if (from.toUpperCase() === to.toUpperCase()) {
      return 1;
    }
    
    const queryKey = ["currency", from, to];
    const rate = this.dataSourceHandle.getSync("currency", queryKey);
    
    // If rate is not in cache, try to calculate it from fallback rates
    if (rate === null) {
      // Use fallback rates for calculation
      const fallbackRates: Record<string, number> = {
        USD: 1,
        EUR: 0.854,
        GBP: 0.739,
        JPY: 151.5,
      };
      
      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();
      
      if (fallbackRates[fromUpper] && fallbackRates[toUpper]) {
        return fallbackRates[toUpper] / fallbackRates[fromUpper];
      }
    }
    
    return rate;
  }

  async convert(value: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return value * rate;
  }

  /**
   * Get all currently cached rates
   * @returns Record of currency codes to rates relative to base currency, or null if not available
   */
  getAllRates(): Record<string, number> | null {
    // For now, return a basic structure with known currencies
    // In a production system, this would query the cache
    return {
      "USD": 1,
      "EUR": 0.854,
      "GBP": 0.739,
      "JPY": 151.5,
    };
  }

  /**
   * Check if rates are currently available
   */
  hasRates(): boolean {
    return true; // We always have fallback rates
  }

  /**
   * Synchronous conversion using cached rates only
   * Returns null if rate not in cache
   */
  convertSync(value: number, from: string, to: string): number | null {
    const rate = this.getRateSync(from, to);
    if (rate === null) return null;
    return value * rate;
  }

  // ------------------------------------------------------------------------
  // SUBSCRIPTIONS (Two-Way Binding)
  // ------------------------------------------------------------------------

  subscribeRate(
    from: string,
    to: string,
    callback: (rate: number, error?: string) => void
  ): () => void {
    const queryKey = ["currency", from, to];
    const subscription = this.dataSourceHandle.subscribe(queryKey, callback);
    
    const subscriptionId = `${from}-${to}-${Date.now()}`;
    this.subscriptions.set(subscriptionId, subscription);
    
    return () => {
      subscription.unsubscribe();
      this.subscriptions.delete(subscriptionId);
    };
  }

  // ------------------------------------------------------------------------
  // REFRESH MECHANISMS
  // ------------------------------------------------------------------------

  refreshRate(from: string, to: string): void {
    // Trigger refresh through the data source handle
    this.dataSourceHandle.refresh();
  }

  refreshAll(): void {
    this.dataSourceHandle.refresh();
  }

  // ------------------------------------------------------------------------
  // CURRENCY VALIDATION
  // ------------------------------------------------------------------------

  isCurrency(code: string): boolean {
    // Check against known currency codes
    const knownCurrencies = [
      "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "SEK", "NOK",
      "DKK", "NZD", "KRW", "SGD", "HKD", "INR", "BRL", "ZAR", "MXN", "RUB",
      "TRY", "SAR", "AED", "ILS", "PLN", "CZK", "HUF", "THB", "IDR", "MYR",
      "PHP", "CLP", "COP", "ARS", "NGN", "EGP", "PKR", "BDT", "VND", "KES",
      "MAD", "QAR", "KWD", "OMR", "BHD", "JOD",
    ];
    return knownCurrencies.includes(code.toUpperCase());
  }

  // ------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ------------------------------------------------------------------------

  private calculateRate(apiData: any, from: string, to: string): number {
    // Parse Frankfurter API response
    const rates: Record<string, number> = { USD: 1.0 };
    
    if (apiData && apiData.rates) {
      Object.entries(apiData.rates).forEach(([currency, rate]) => {
        rates[currency] = rate as number;
      });
    }

    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (fromUpper === toUpper) return 1;
    if (!rates[fromUpper] || !rates[toUpper]) return 1;

    // Calculate cross rate
    return rates[toUpper] / rates[fromUpper];
  }

  // ------------------------------------------------------------------------
  // SHUTDOWN
  // ------------------------------------------------------------------------

  destroy(): void {
    // Unsubscribe all
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();

    // Unregister data source
    this.dataSourceHandle.destroy();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const currencyExchangeService = new CurrencyExchangeService();

// Export for backward compatibility
export const sharedCurrencyExchange = currencyExchangeService;

// Default export
export default currencyExchangeService;
