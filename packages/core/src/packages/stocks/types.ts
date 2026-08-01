/** A current stock quote, as returned by a host-supplied `fetchQuote`. */
export interface StockQuote {
	/** Current price, in `currency` (default "USD"). */
	price: number;
	/** ISO 4217 currency code. Defaults to "USD" if omitted. */
	currency?: string;
}

/** A historical stock quote for one calendar date, as returned by a host-supplied `fetchHistoricalQuote`. */
export interface StockHistoricalQuote {
	/** Closing price on the requested date, in `currency` (default "USD"). */
	close: number;
	/** Trading volume (share count) on the requested date, if available. */
	volume?: number;
	/** ISO 4217 currency code. Defaults to "USD" if omitted. */
	currency?: string;
}

/**
 * Configuration for {@link createStocksPackage} — see `StocksPackage.ts`'s
 * module doc for the full "bring your own data source" rationale.
 */
export interface StocksPackageConfig {
	/**
	 * Fetch the current quote for `ticker` (already upper-cased). Required
	 * for `stock(TICKER)` / `N stock(TICKER)` to return real data — when
	 * omitted, those expressions resolve to an honest
	 * `STOCKS_NOT_CONFIGURED` error `Value`, never a faked/zero price.
	 */
	fetchQuote?: (ticker: string, signal: AbortSignal) => Promise<StockQuote>;

	/**
	 * Fetch a historical quote for `ticker` on `isoDate` (`YYYY-MM-DD`).
	 * Required for the `on <date>` / `close on <date>` / `volume on <date>`
	 * forms — when omitted, those expressions resolve to an honest
	 * `STOCKS_NOT_CONFIGURED` error `Value`.
	 */
	fetchHistoricalQuote?: (ticker: string, isoDate: string, signal: AbortSignal) => Promise<StockHistoricalQuote>;

	/**
	 * Enable the bare-ticker grammar (`AAPL` alone, no `stock(...)`
	 * wrapper) for the small bundled allow-list in `MajorTickers.ts`.
	 * Default `false` — a bare all-caps word is genuinely ambiguous with a
	 * variable name (`:AAPL = 5`), so this is opt-in even though the
	 * package itself is already opt-in. The `stock(TICKER)` function-call
	 * form works regardless of this setting and is the only ALWAYS-
	 * reachable syntax — see StocksPackage.ts's module doc.
	 */
	enableBareTickerRecognition?: boolean;

	/**
	 * TanStack Query staleTime for CURRENT-price lookups, in ms. Default 60s
	 * — intraday quotes move continuously, so a short stale window keeps
	 * re-evaluation reasonably fresh without re-fetching on every keystroke.
	 */
	staleTimeMs?: number;

	/**
	 * TanStack Query staleTime for HISTORICAL (`on <date>`) lookups, in ms.
	 * Default 30 days — a closing price for a specific past date is
	 * immutable, so this is set long purely to avoid pointless repeat
	 * fetches, not because the data could go stale.
	 */
	historicalStaleTimeMs?: number;
}
