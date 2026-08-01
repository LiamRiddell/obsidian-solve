import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { stripQuotes } from "@solve-js/utilities/Strings";
import { tryParseDatePhrase, type ParsedDatePhrase } from "../DatePhrase";
import { STOCK_TICKER_TYPE } from "../normalizer/StockTickerNormalizerRule";

interface DateSuffix {
	field: "close" | "volume";
	date: ParsedDatePhrase;
}

/**
 * Optional `on <date>` / `close on <date>` / `volume on <date>` suffix,
 * shared by both the `stock(TICKER)` function-call form and the bare-
 * ticker stretch-goal form — see StocksPackage.ts's module doc for why
 * only the FIRST is always reachable.
 *
 * Returns `null` (consuming nothing) if no suffix is present at all —
 * `stock(AAPL)` alone is a complete, valid expression. Once "close",
 * "volume", or "on" IS seen, the rest of the suffix is required; a
 * malformed continuation is a parse error, not a silent fallback to the
 * current-price form (which would misreport a failed historical lookup
 * as a live quote).
 */
function tryParseDateSuffix(parser: Parser): DateSuffix | null {
	const next = parser.peek();
	if (!next || next.type !== "IDENT") return null;

	const lower = next.value.toLowerCase();
	let field: "close" | "volume" = "close";

	if (lower === "close" || lower === "volume") {
		field = lower;
		parser.consume();
		const onTok = parser.peek();
		if (!onTok || onTok.type !== "IDENT" || onTok.value.toLowerCase() !== "on") {
			throw ErrorFactory.parsing(
				"STOCKS_EXPECTED_ON",
				`Expected "on <date>" after "${lower}" (e.g. "AAPL ${lower} on April 12, 2005")`,
			);
		}
		parser.consume();
	} else if (lower === "on") {
		parser.consume();
	} else {
		return null;
	}

	const date = tryParseDatePhrase(parser);
	if (!date) {
		throw ErrorFactory.parsing(
			"STOCKS_EXPECTED_DATE",
			`Expected a date after "on" (e.g. "April 12, 2005" or "4/12/2005")`,
		);
	}
	return { field, date };
}

/**
 * Emit either the current-price query (`CALL_PLUGIN currentFnIdx`, query =
 * just the ticker) or the historical query (`CALL_PLUGIN historicalFnIdx`,
 * query = `"<field>:<ticker>:<isoDate>"`) — see StocksPackage.ts for why
 * these are two separate `createQueryResolver` instances (different
 * staleTimes: live quotes vs. immutable historical closes).
 */
function emitStockQuery(
	builder: BytecodeBuilder,
	ticker: string,
	suffix: DateSuffix | null,
	currentFnIdx: number,
	historicalFnIdx: number,
): void {
	builder.emitOpcode(OpCode.PUSH_STRING);
	if (!suffix) {
		builder.emitString(ticker);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitIndex(currentFnIdx);
		builder.emitIndex(1);
	} else {
		builder.emitString(`${suffix.field}:${ticker}:${suffix.date.isoDate}`);
		builder.emitOpcode(OpCode.CALL_PLUGIN);
		builder.emitIndex(historicalFnIdx);
		builder.emitIndex(1);
	}
}

/**
 * Finish compiling a stock expression once the ticker itself has been
 * resolved (from either `stock(TICKER)` or a fused bare `STOCK_TICKER`
 * token) — checks for the `on <date>` / `close on <date>` / `volume on
 * <date>` suffix and emits the right query, sharing this tail between
 * both parselets below.
 *
 * **The phantom-STAR problem**: `normalizer/BuiltinNormalizerRules.ts`'s
 * generic `implicitMultiplyRule` inserts a `STAR` between any `RPAREN`
 * (or, for the bare-ticker form, any word-shaped token) and a following
 * bare word — it has no way to know "on"/"close"/"volume" are reserved by
 * THIS package's grammar rather than an implicit multiplicand (the same
 * ambiguity its own `canStart`-phrase guard exists for, just not
 * reachable from here without registering "on"/"close"/"volume" as
 * globally-visible phrase-start words, which would carry the same
 * variable-name collision risk this package works hard to avoid
 * elsewhere). So: peek for a STAR first. If one is NOT immediately
 * followed by our suffix, it's a real multiplication (either the
 * implicit-multiply artifact against some OTHER right-hand expression, or
 * the user genuinely typed `stock(AAPL) * 2`) — since the STAR has
 * already been consumed here, the outer Pratt loop can no longer dispatch
 * it as an infix operator, so this finishes compiling the multiplication
 * itself rather than silently dropping the operator.
 */
function finishStockExpression(
	parser: Parser,
	builder: BytecodeBuilder,
	ticker: string,
	currentFnIdx: number,
	historicalFnIdx: number,
): void {
	let sawStar = false;
	if (parser.peek()?.type === "STAR") {
		parser.consume();
		sawStar = true;
	}

	const suffix = tryParseDateSuffix(parser);

	if (sawStar && !suffix) {
		// Real multiplication, not our suffix — finish it here since the
		// STAR is already consumed and can't go back to the outer loop.
		emitStockQuery(builder, ticker, null, currentFnIdx, historicalFnIdx);
		parser.parseExpression(BindingPower.Product, builder);
		builder.emitOpcode(OpCode.MUL);
		return;
	}

	emitStockQuery(builder, ticker, suffix, currentFnIdx, historicalFnIdx);
}

/**
 * `stock(TICKER)` / `stock("TICKER")` — the PRIMARY, always-reachable
 * stocks syntax (see StocksPackage.ts's module doc: bare tickers are
 * ambiguous with variable names, so this function-call form is the one
 * form that works regardless of `enableBareTickerRecognition`). Triggered
 * on the `STOCK_FN` keyword token (see StocksPackage.ts's `lexerVocabulary`).
 *
 * Accepts either a quoted ticker (`stock("AAPL")`) or a bare identifier
 * inside the parens (`stock(AAPL)`) — unambiguous either way, since the
 * parens make this unmistakably a function call, not a variable read
 * (mirrors `examples/osrs/OsrsParselet.ts`'s `ge("Iron Axe")` /
 * `osrs.ge(Iron Axe)` dual acceptance for the same reason).
 */
export function stockFnParselet(currentFnIdx: number, historicalFnIdx: number): PrefixParselet {
	return {
		category: "Stocks",
		parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
			parser.consume("LPAREN");
			const tickerToken = parser.consume();
			let ticker: string;
			if (tickerToken.type === "STRING") {
				ticker = stripQuotes(tickerToken.value).toUpperCase();
			} else if (tickerToken.type === "IDENT" || tickerToken.type === STOCK_TICKER_TYPE) {
				ticker = tickerToken.value.toUpperCase();
			} else {
				throw ErrorFactory.parsing(
					"STOCKS_INVALID_TICKER",
					`Expected a ticker symbol inside stock(...), got "${tickerToken.value}" (${tickerToken.type})`,
				);
			}
			parser.consume("RPAREN");

			finishStockExpression(parser, builder, ticker, currentFnIdx, historicalFnIdx);
		},
	};
}

/**
 * Bare-ticker stretch-goal form (`AAPL` alone, no `stock(...)` wrapper) —
 * only reachable when `StocksPackageConfig.enableBareTickerRecognition`
 * is true, which registers `StockTickerNormalizerRule` to fuse a KNOWN
 * ticker (from the bundled `MAJOR_TICKERS` allow-list — never a blanket
 * "any uppercase word" rule) into a `STOCK_TICKER` token; this parselet
 * handles that fused token.
 */
export function bareStockTickerParselet(currentFnIdx: number, historicalFnIdx: number): PrefixParselet {
	return {
		category: "Stocks",
		parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
			const ticker = token.value.toUpperCase();
			finishStockExpression(parser, builder, ticker, currentFnIdx, historicalFnIdx);
		},
	};
}
