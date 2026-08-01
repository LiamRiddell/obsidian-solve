/**
 * Small, bundled allow-list of well-known US-listed ticker symbols.
 *
 * This exists ONLY to safely gate the OPT-IN bare-ticker grammar ("AAPL"
 * alone, no `stock(...)` wrapper) — see `StocksPackage.ts`'s
 * `enableBareTickerRecognition` option and
 * `normalizer/StockTickerNormalizerRule.ts`. A bare all-caps 1-5 letter
 * word is genuinely ambiguous with a variable name (`:AAPL = 5` is a
 * perfectly reasonable thing for a user to write), so this package never
 * treats EVERY uppercase word as a ticker — only exact (case-sensitive)
 * matches against this bundled list, the same mitigation
 * `time/timezones/CityZones.ts` uses for city names. Deliberately not
 * exhaustive (real ticker universes run into the tens of thousands);
 * additive — extend as gaps are found, no other code needs to change.
 */
export const MAJOR_TICKERS: ReadonlySet<string> = new Set([
	// ── Big tech ──
	"AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "NFLX",
	"ADBE", "CRM", "ORCL", "IBM", "INTC", "AMD", "CSCO", "PYPL", "UBER",
	"ABNB", "SPOT", "SHOP", "SQ", "COIN", "PLTR", "SNOW", "ZM",
	// ── Finance ──
	"JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP",
	// ── Consumer / retail ──
	"WMT", "COST", "HD", "NKE", "SBUX", "MCD", "KO", "PEP", "DIS", "TGT",
	// ── Industrial / energy / auto ──
	"BA", "GE", "F", "GM", "XOM", "CVX",
	// ── Healthcare ──
	"PFE", "JNJ", "UNH", "MRNA",
	// ── Semis / hardware (international ADRs) ──
	"TSM", "ASML", "BABA",
]);
