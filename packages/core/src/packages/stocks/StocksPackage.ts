import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { createQueryResolver } from "@solve-js/resolvers/QueryResolver";
import { errorValue, numberValue, uomValue, type Value } from "@solve-js/vm/Value";
import { stockFnParselet, bareStockTickerParselet } from "./parselets/StockParselet";
import { stockTickerNormalizerRule, STOCK_TICKER_TYPE } from "./normalizer/StockTickerNormalizerRule";
import type { StocksPackageConfig } from "./types";

/**
 * Live stock prices — `stock(TICKER)`, `stock(TICKER) on <date>`,
 * `stock(TICKER) close on <date>`, `stock(TICKER) volume on <date>`, plus
 * an opt-in bare-ticker form (`AAPL`, `AAPL on April 12, 2005`, ...).
 *
 * **Why a factory, not a constant `STOCKS_PACKAGE` export**: unlike
 * Weather's Open-Meteo, there is no free/keyless stock-quote API — every
 * option surveyed (Alpha Vantage, Finnhub, Twelve Data, IEX Cloud, ...)
 * requires the HOST application to sign up for its own API key. Baking in
 * a specific paid provider (or worse, a hardcoded key) would either not
 * work out of the box for most hosts or silently commit them to a vendor
 * choice they didn't make. Instead this package is an extension point —
 * "packages are our approach, we're providing an SDK" — a host supplies
 * `fetchQuote`/`fetchHistoricalQuote` (backed by whichever provider and
 * key THEY have) via {@link createStocksPackage}'s `config` argument. No
 * config -> every stock expression resolves to a clearly-worded
 * `STOCKS_NOT_CONFIGURED` error `Value`, never a faked or zero price (see
 * `packages/finance/parselets/SalesTaxParselet.ts`'s doc comment for the
 * same "never guess a number the caller didn't provide" principle applied
 * to a different package).
 *
 * **Not a member of `BUILTIN_PACKAGES`** (see `packages/builtins.ts`) —
 * unconfigured, this package does nothing useful, exactly like
 * `examples/osrs` is deliberately excluded from the built-in set. A host
 * that wants it calls `createStocksPackage({ fetchQuote, ... })` and adds
 * the result to their `ExpressionEngine`'s `packages` array themselves.
 *
 * **Ticker recognition**: the function-call form `stock(TICKER)` is the
 * PRIMARY, always-reachable syntax — a bare all-caps word ("AAPL") is
 * genuinely ambiguous with a variable name (`:AAPL = 5` is a reasonable
 * thing to write), so it is never claimed unconditionally. The bare form
 * is available only via `config.enableBareTickerRecognition`, gated to a
 * small bundled allow-list of major tickers (`MajorTickers.ts`) — see
 * `normalizer/StockTickerNormalizerRule.ts`'s doc comment for the full
 * reasoning, mirroring `time/timezones/CityZones.ts`'s known-table
 * mitigation for the same class of ambiguity.
 *
 * **Two separate async resolvers** (`stocks-current`/`stocks-historical`,
 * two distinct `CALL_PLUGIN` indices) rather than one shared one, unlike
 * Weather's single shared resolver — current-price and historical-close
 * lookups warrant genuinely different `staleTimeMs` (a live quote goes
 * stale in seconds; a historical close for a fixed past date never goes
 * stale at all), and `createQueryResolver` bakes `staleTimeMs` into the
 * resolver instance, not the per-call query.
 */
export function createStocksPackage(config: StocksPackageConfig = {}): IEnginePackage {
	const currentFnIdx = allocatePluginFunctionIndex();
	const historicalFnIdx = allocatePluginFunctionIndex();

	function notConfigured(what: string): Value {
		return errorValue(
			"STOCKS_NOT_CONFIGURED",
			`Stock data provider not configured — see packages/core/src/packages/stocks/StocksPackage.ts's JSDoc for how to supply ${what} via createStocksPackage({ ... }).`,
		);
	}

	const { resolver: currentResolver, pluginFunction: currentPluginFunction } = createQueryResolver({
		namespace: "stocks-current",
		pluginFunctionIndex: currentFnIdx,
		staleTimeMs: config.staleTimeMs ?? 60_000, // 1 min — intraday quotes move continuously
		fetchQuery: async (ticker: string, signal: AbortSignal): Promise<Value> => {
			if (!config.fetchQuote) return notConfigured("fetchQuote");
			const quote = await config.fetchQuote(ticker, signal);
			return uomValue(quote.price, quote.currency ?? "USD");
		},
	});

	const { resolver: historicalResolver, pluginFunction: historicalPluginFunction } = createQueryResolver({
		namespace: "stocks-historical",
		pluginFunctionIndex: historicalFnIdx,
		staleTimeMs: config.historicalStaleTimeMs ?? 30 * 24 * 60 * 60 * 1000, // 30 days — a past close never changes
		fetchQuery: async (query: string, signal: AbortSignal): Promise<Value> => {
			const [field, ticker, isoDate] = query.split(":");
			if (!config.fetchHistoricalQuote) return notConfigured("fetchHistoricalQuote");
			const quote = await config.fetchHistoricalQuote(ticker, isoDate, signal);
			if (field === "volume") return numberValue(quote.volume ?? 0);
			return uomValue(quote.close, quote.currency ?? "USD");
		},
	});

	const pkg: IEnginePackage = {
		name: "solve-stocks",

		lexerVocabulary: {
			// "stock" is claimed as a bare keyword (unlike Weather's phrase-
			// fused triggers) — same trade-off `examples/osrs/OsrsLexerVocabulary.ts`
			// accepts for "ge"/"osrs"/"price": acceptable ONLY because this
			// whole package is opt-in (never in BUILTIN_PACKAGES), so the risk
			// (":stock = 5" would collide if a host both uses that variable
			// name AND opts into this package) is scoped to hosts who
			// explicitly chose both. A host hitting this collision should pick
			// a different variable name; `stock(...)` itself never collides
			// since the LPAREN makes it unambiguous.
			keywords: { stock: "STOCK_FN" },
		},

		prefixParselets: [
			{ tokenType: "STOCK_FN", parselet: stockFnParselet(currentFnIdx, historicalFnIdx) },
			...(config.enableBareTickerRecognition
				? [{ tokenType: STOCK_TICKER_TYPE, parselet: bareStockTickerParselet(currentFnIdx, historicalFnIdx) }]
				: []),
		],

		normalizerRules: config.enableBareTickerRecognition ? [stockTickerNormalizerRule()] : [],

		pluginFunctions: [
			{ index: currentFnIdx, handler: currentPluginFunction },
			{ index: historicalFnIdx, handler: historicalPluginFunction },
		],

		asyncResolvers: [currentResolver, historicalResolver],
	};

	return pkg;
}
