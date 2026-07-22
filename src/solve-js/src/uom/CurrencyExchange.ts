/**
 * Production-grade currency exchange service with scalable architecture
 * Integrates with DataQueryService for worker-based execution
 */

import { createTimeoutSignal } from "@solve-js/utilities/TimeoutSignal";

// ============================================================================
// CURRENCY EXCHANGE SERVICE
// ============================================================================

export class CurrencyExchangeService {
  private subscriptions: Map<string, Set<(rate: number, error?: string) => void>> = new Map();

  /**
   * Live rate tables cached from successful getRate() fetches, keyed by
   * uppercase base currency. Each table holds every rate the API returned
   * for that base (plus the base itself at 1), so any pair whose two codes
   * appear in one fresh table can be served synchronously — including
   * cross pairs via triangulation (EUR→GBP through a USD-base table).
   * Stale tables are ignored, not evicted; the next successful fetch for
   * the same base overwrites them.
   */
  private baseTables: Map<string, { fetchedAt: number; rates: Record<string, number> }> = new Map();

  /**
   * How long a fetched rate may be served synchronously by getRateSync().
   * Beyond this window callers fall through to the async path (expression
   * shows Pending until the fetch lands).
   */
  private static readonly RATE_FRESHNESS_MS = 15 * 60 * 1000;

  constructor() {}

  // ------------------------------------------------------------------------
  // RATE FETCHING
  // ------------------------------------------------------------------------

  /**
   * Timeout (ms) for currency exchange rate fetches.
   *
   * If the frankfurter API doesn't respond within this window, the fetch
   * is aborted — preventing indefinite "Pending" states in the playground
   * and Obsidian plugin when the exchange rate API is unreachable.
   */
  private static readonly FETCH_TIMEOUT_MS = 10_000;

  async getRate(from: string, to: string, signal?: AbortSignal): Promise<number> {
    // Combine the caller's optional abort signal with a hard timeout so a
    // hanging currency API never blocks re-evaluation indefinitely.
    const { signal: fetchSignal, cleanup } = createTimeoutSignal(
      signal,
      CurrencyExchangeService.FETCH_TIMEOUT_MS,
      "Currency API fetch",
    );

    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${from.toUpperCase()}`, { signal: fetchSignal });
      if (!response.ok) throw new Error(`Currency API returned ${response.status}`);
      const data = await response.json();
      const rates: Record<string, number> = data.rates ?? {};
      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();
      if (rates[toUpper] === undefined) throw new Error(`Unknown currency: ${toUpper}`);

      // The API returns ALL rates for the base currency — cache the whole
      // table so subsequent conversions (including cross pairs via
      // triangulation) resolve synchronously within the freshness window
      // instead of going Pending again.
      this.baseTables.set(fromUpper, {
        fetchedAt: Date.now(),
        rates: { ...rates, [fromUpper]: 1 },
      });

      return rates[toUpper];
    } finally {
      cleanup();
    }
  }

  /**
   * Seed a base rate table without a network fetch.
   *
   * Intended for tests and for future user-provided offline rates —
   * production live data always comes from {@link getRate}. Seeded rates
   * obey the same freshness window as fetched ones.
   *
   * @param base - Base currency code (e.g. "USD").
   * @param rates - Map of currency code → rate relative to the base.
   */
  primeRates(base: string, rates: Record<string, number>): void {
    const baseUpper = base.toUpperCase();
    this.baseTables.set(baseUpper, {
      fetchedAt: Date.now(),
      rates: { ...rates, [baseUpper]: 1 },
    });
  }

  /**
   * Synchronous rate lookup: `1` for same-currency pairs, a cached LIVE
   * rate if one was fetched within {@link RATE_FRESHNESS_MS}, otherwise
   * `null` — callers fall through to the async fetch path and the
   * expression shows Pending until real data arrives.
   *
   * There is deliberately no hardcoded fallback table: a stale made-up
   * rate presented as a real conversion is worse than a Pending state.
   */
  getRateSync(from: string, to: string): number | null {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();
    if (fromUpper === toUpper) {
      return 1;
    }
    const now = Date.now();
    for (const table of this.baseTables.values()) {
      if (now - table.fetchedAt > CurrencyExchangeService.RATE_FRESHNESS_MS) continue;
      const fromRate = table.rates[fromUpper];
      const toRate = table.rates[toUpper];
      if (fromRate && toRate) {
        return toRate / fromRate;
      }
    }
    return null;
  }

  async convert(value: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return value * rate;
  }

  /**
   * Get all currently cached fresh rates, keyed "FROM:TO".
   * @returns Snapshot of fresh live rates, or null when none are cached.
   */
  getAllRates(): Record<string, number> | null {
    const now = Date.now();
    const snapshot: Record<string, number> = {};
    let any = false;
    for (const [base, table] of this.baseTables) {
      if (now - table.fetchedAt > CurrencyExchangeService.RATE_FRESHNESS_MS) continue;
      for (const [code, rate] of Object.entries(table.rates)) {
        snapshot[`${base}:${code}`] = rate;
        any = true;
      }
    }
    return any ? snapshot : null;
  }

  /**
   * Check whether any fresh live rates are currently cached.
   */
  hasRates(): boolean {
    return this.getAllRates() !== null;
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
    const queryKeyStr = JSON.stringify(queryKey);
    
    if (!this.subscriptions.has(queryKeyStr)) {
      this.subscriptions.set(queryKeyStr, new Set());
    }
    this.subscriptions.get(queryKeyStr)!.add(callback);
    
    // Immediately return current rate if available
    const currentRate = this.getRateSync(from, to);
    if (currentRate !== null) {
      callback(currentRate);
    }
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscriptions.get(queryKeyStr);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscriptions.delete(queryKeyStr);
        }
      }
    };
  }

  // ------------------------------------------------------------------------
  // REFRESH MECHANISMS
  // ------------------------------------------------------------------------

  refreshRate(from: string, to: string): void {
    // No-op: TanStack Query handles refresh via invalidateQueries()
  }

  refreshAll(): void {
    // No-op: TanStack Query handles refresh via invalidateQueries()
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
      "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT",
    ];
    return knownCurrencies.includes(code.toUpperCase());
  }

  // ------------------------------------------------------------------------
  // SHUTDOWN
  // ------------------------------------------------------------------------

  destroy(): void {
    this.subscriptions.clear();
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
