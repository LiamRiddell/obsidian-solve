/**
 * Production-grade currency exchange service with scalable architecture
 * Integrates with DataQueryService for worker-based execution
 */

import { createTimeoutSignal } from "@solve-js/utilities/TimeoutSignal";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Error codes for this service. Co-located rather than unioned into
 * `errors/ErrorCode.ts`'s core catalog (that catalog is scoped to the
 * parser/VM/engine/errors/config/lexer layers, not yet the ~17 domain
 * packages — see that file's module doc for the intended per-package
 * pattern this follows).
 */
export const CurrencyErrorCodes = {
  /** Frankfurter's rates endpoint returned a non-OK HTTP status. */
  API_ERROR: "CURRENCY_API_ERROR",
  /** A requested currency/crypto code isn't in the fetched rate table — an unrecognized code, not an API failure. */
  UNKNOWN_CODE: "UNKNOWN_CURRENCY_CODE",
  /** CoinGecko's simple-price endpoint returned a non-OK HTTP status. */
  CRYPTO_API_ERROR: "CRYPTO_PRICE_API_ERROR",
} as const;

// ============================================================================
// CURRENCY EXCHANGE SERVICE
// ============================================================================

export class CurrencyExchangeService {
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

  /**
   * Ticker → CoinGecko coin id, for the cryptocurrencies `isCurrency()`
   * recognizes. Frankfurter (the fiat rate source below) is ECB reference
   * rates only and has no concept of BTC/ETH/etc — routing a crypto code
   * through it as `base=BTC` fails outright, which is why crypto pairs
   * previously never resolved (see CurrencyAsyncResolver/VM.ts's ADD
   * handling for the two bugs that let that failure pass silently instead
   * of surfacing as a real fetch).
   */
  private static readonly CRYPTO_IDS: Record<string, string> = {
    BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple",
    ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot",
  };

  private isCryptoCode(code: string): boolean {
    return code.toUpperCase() in CurrencyExchangeService.CRYPTO_IDS;
  }

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

  /**
   * Fetch the live exchange rate for converting 1 unit of `from` into `to`.
   *
   * Routes cryptocurrency codes (see {@link CRYPTO_IDS}) to CoinGecko and
   * everything else to Frankfurter (ECB reference rates, fiat-only). On
   * success, caches the whole returned rate table for `from` so subsequent
   * lookups — including cross-pairs via triangulation — can be served
   * synchronously by {@link getRateSync} within the freshness window.
   *
   * @throws If the currency code is unrecognized or the fetch fails/times out.
   */
  async getRate(from: string, to: string, signal?: AbortSignal): Promise<number> {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (this.isCryptoCode(fromUpper) || this.isCryptoCode(toUpper)) {
      return this.getCryptoRate(fromUpper, toUpper, signal);
    }

    // Combine the caller's optional abort signal with a hard timeout so a
    // hanging currency API never blocks re-evaluation indefinitely.
    const { signal: fetchSignal, cleanup } = createTimeoutSignal(
      signal,
      CurrencyExchangeService.FETCH_TIMEOUT_MS,
      "Currency API fetch",
    );

    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${fromUpper}`, { signal: fetchSignal });
      if (!response.ok) throw ErrorFactory.external(CurrencyErrorCodes.API_ERROR, `Currency API returned ${response.status}`, { status: response.status });
      const data = await response.json();
      // The v2 endpoint returns a flat array of { date, base, quote, rate }
      // entries (one per target currency) rather than the classic v1 shape
      // { base, date, rates: { CODE: rate } }. Reading data.rates against
      // the real response is always undefined, so every conversion used to
      // throw "Unknown currency" no matter which currencies were requested.
      // Accept both shapes so a future API revision back to the object form
      // doesn't silently break this again.
      const rates: Record<string, number> = Array.isArray(data)
        ? Object.fromEntries(
            data
              .filter((entry: unknown): entry is { quote: string; rate: number } =>
                !!entry && typeof (entry as any).quote === "string" && typeof (entry as any).rate === "number")
              .map((entry: { quote: string; rate: number }) => [entry.quote.toUpperCase(), entry.rate])
          )
        : (data.rates ?? {});
      if (rates[toUpper] === undefined) throw ErrorFactory.validation(CurrencyErrorCodes.UNKNOWN_CODE, `Unknown currency: ${toUpper}`, { code: toUpper });

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
   * Crypto rate fetch, routed through CoinGecko's no-auth simple-price
   * endpoint instead of Frankfurter (fiat-only, has no BTC/ETH concept).
   * Handles all three combinations — crypto→crypto, crypto→fiat,
   * fiat→crypto — via prices denominated in USD (or the target fiat
   * directly, which CoinGecko's `vs_currencies` also accepts), then
   * caches the result as a same-shaped base table so getRateSync /
   * convertSync keep working unchanged for crypto pairs too.
   */
  private async getCryptoRate(fromUpper: string, toUpper: string, signal?: AbortSignal): Promise<number> {
    const { signal: fetchSignal, cleanup } = createTimeoutSignal(
      signal,
      CurrencyExchangeService.FETCH_TIMEOUT_MS,
      "Crypto price API fetch",
    );

    try {
      const fromIsCrypto = this.isCryptoCode(fromUpper);
      const toIsCrypto = this.isCryptoCode(toUpper);
      let rate: number;

      if (fromIsCrypto && toIsCrypto) {
        const fromId = CurrencyExchangeService.CRYPTO_IDS[fromUpper];
        const toId = CurrencyExchangeService.CRYPTO_IDS[toUpper];
        const data = await this.fetchCoinGeckoPrices([fromId, toId], "usd", fetchSignal);
        const fromUsd = data[fromId]?.usd;
        const toUsd = data[toId]?.usd;
        if (typeof fromUsd !== "number") throw ErrorFactory.validation(CurrencyErrorCodes.UNKNOWN_CODE, `Unknown currency: ${fromUpper}`, { code: fromUpper });
        if (typeof toUsd !== "number") throw ErrorFactory.validation(CurrencyErrorCodes.UNKNOWN_CODE, `Unknown currency: ${toUpper}`, { code: toUpper });
        rate = fromUsd / toUsd;
      } else if (fromIsCrypto) {
        const fromId = CurrencyExchangeService.CRYPTO_IDS[fromUpper];
        const vs = toUpper.toLowerCase();
        const data = await this.fetchCoinGeckoPrices([fromId], vs, fetchSignal);
        const value = data[fromId]?.[vs];
        if (typeof value !== "number") throw ErrorFactory.validation(CurrencyErrorCodes.UNKNOWN_CODE, `Unknown currency: ${toUpper}`, { code: toUpper });
        rate = value;
      } else {
        const toId = CurrencyExchangeService.CRYPTO_IDS[toUpper];
        const vs = fromUpper.toLowerCase();
        const data = await this.fetchCoinGeckoPrices([toId], vs, fetchSignal);
        const priceOfToInFrom = data[toId]?.[vs];
        if (typeof priceOfToInFrom !== "number") throw ErrorFactory.validation(CurrencyErrorCodes.UNKNOWN_CODE, `Unknown currency: ${fromUpper}`, { code: fromUpper });
        rate = 1 / priceOfToInFrom;
      }

      // Cache as a single-pair base table, same shape Frankfurter fetches
      // produce, so getRateSync/convertSync's triangulation logic doesn't
      // need to know or care which source a rate came from.
      this.baseTables.set(fromUpper, {
        fetchedAt: Date.now(),
        rates: { [fromUpper]: 1, [toUpper]: rate },
      });

      return rate;
    } finally {
      cleanup();
    }
  }

  private async fetchCoinGeckoPrices(ids: string[], vsCurrency: string, signal: AbortSignal): Promise<Record<string, Record<string, number>>> {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${vsCurrency}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw ErrorFactory.external(CurrencyErrorCodes.CRYPTO_API_ERROR, `Crypto price API returned ${response.status}`, { status: response.status });
    return response.json();
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
   * Drop every cached/primed rate table.
   *
   * Mainly for test isolation: {@link sharedCurrencyExchange} is a
   * module-level singleton, so a rate primed or fetched by one test can
   * silently leak into a later test in the same file. Also usable in
   * production if a caller ever wants to force a full re-fetch.
   */
  clearRates(): void {
    this.baseTables.clear();
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

  /** Convert `value` from `from` to `to` using a freshly-fetched live rate (see {@link getRate}). */
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
  // CURRENCY VALIDATION
  // ------------------------------------------------------------------------

  /**
   * Check whether `code` is a recognized currency code (fiat or the
   * cryptocurrencies in {@link CRYPTO_IDS}) — a fixed allowlist, not a
   * live lookup against any API.
   */
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

}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const currencyExchangeService = new CurrencyExchangeService();

// Export for backward compatibility
export const sharedCurrencyExchange = currencyExchangeService;

// Default export
export default currencyExchangeService;
