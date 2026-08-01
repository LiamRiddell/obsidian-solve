import type { Token } from "@solve-js/lexer/Token";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import type { NormalizerRule, NormalizerMatch } from "@solve-js/normalizer/NormalizerRule";
import { MAJOR_TICKERS } from "../MajorTickers";

export const STOCK_TICKER_TYPE = "STOCK_TICKER";
export const STOCK_TICKER_TYPE_ID = tokenTypeId(STOCK_TICKER_TYPE);

/**
 * Bare-ticker recognition (stretch goal) — fuses an IDENT token into a
 * `STOCK_TICKER` token ONLY when its raw text is an EXACT (case-sensitive)
 * match against the small bundled `MAJOR_TICKERS` allow-list, mirroring
 * `time/timezones/CityZones.ts`'s "known table, not a blanket character-
 * class rule" mitigation for the exact same class of problem (a bare word
 * that's also a plausible variable name).
 *
 * Only registered when `StocksPackageConfig.enableBareTickerRecognition`
 * is true — see StocksPackage.ts. Two safeguards beyond the allow-list
 * itself:
 *
 * - **Case-sensitive.** "AAPL" fuses; "aapl"/"Aapl" do not — lowercase or
 *   mixed-case spellings stay ordinary identifiers/variable reads.
 * - **Colon-prefix guard.** `:AAPL = 5` is left alone (not fused) so a
 *   host that also uses a ticker-shaped word as a variable name can still
 *   declare it — same reasoning as `VariableParselet.ts`'s keyword-shaped-
 *   name policy, applied here even though tickers aren't lexer keywords.
 *
 * This does NOT eliminate the ambiguity (a bare, no-colon `AAPL` read as a
 * previously-declared variable is genuinely indistinguishable from a
 * ticker query without deeper context) — it narrows the blast radius from
 * "every uppercase word" to "~50 specific, well-known symbols," which is
 * the documented trade-off `enableBareTickerRecognition` asks a host to
 * accept explicitly, opt-in on top of an already-opt-in package.
 */
export function stockTickerNormalizerRule(): NormalizerRule {
	return {
		name: "stocks:bare-ticker",
		priority: 20,
		match(tokens: Token[], pos: number): NormalizerMatch | null {
			const token = tokens[pos];
			if (!token || token.type !== "IDENT") return null;
			if (!MAJOR_TICKERS.has(token.value)) return null;
			if (pos > 0 && tokens[pos - 1].type === "COLON") return null;

			const fusedToken = new LexerToken(
				STOCK_TICKER_TYPE,
				STOCK_TICKER_TYPE_ID,
				token.value,
				token.value,
				token.offset,
				0,
				token.line,
				token.col,
			);

			return { consumed: 1, replacement: [fusedToken], ruleName: "stocks:bare-ticker" };
		},
	};
}
