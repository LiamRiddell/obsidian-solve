import { describe, expect, test } from "@jest/globals";
import { LexerToken } from "@solve-js/lexer/ExpressionLexer";
import { tokenTypeId } from "@solve-js/lexer/Token";
import { stockTickerNormalizerRule, STOCK_TICKER_TYPE } from "@solve-js/packages/stocks/normalizer/StockTickerNormalizerRule";
import { MAJOR_TICKERS } from "@solve-js/packages/stocks/MajorTickers";

function ident(value: string): LexerToken {
	return new LexerToken("IDENT", tokenTypeId("IDENT"), value, value, 0, 0, 1, 1);
}
function colon(): LexerToken {
	return new LexerToken("COLON", tokenTypeId("COLON"), ":", ":", 0, 0, 1, 1);
}

describe("stockTickerNormalizerRule", () => {
	const rule = stockTickerNormalizerRule();

	test("fuses a known major ticker (exact case) into STOCK_TICKER", () => {
		const tokens = [ident("AAPL")];
		const match = rule.match(tokens, 0);
		expect(match).not.toBeNull();
		expect(match!.consumed).toBe(1);
		expect(match!.replacement[0].type).toBe(STOCK_TICKER_TYPE);
		expect(match!.replacement[0].value).toBe("AAPL");
	});

	test("does NOT fuse a lowercase spelling of a known ticker (case-sensitive by design)", () => {
		const tokens = [ident("aapl")];
		expect(rule.match(tokens, 0)).toBeNull();
	});

	test("does NOT fuse mixed-case spellings", () => {
		const tokens = [ident("Aapl")];
		expect(rule.match(tokens, 0)).toBeNull();
	});

	test("does NOT fuse a word that isn't in the bundled allow-list, even if all-caps", () => {
		const tokens = [ident("ZZZZZ")];
		expect(rule.match(tokens, 0)).toBeNull();
	});

	test("does NOT fuse immediately after a COLON — preserves ':AAPL = 5' as a variable declaration", () => {
		const tokens = [colon(), ident("AAPL")];
		expect(rule.match(tokens, 1)).toBeNull();
	});

	test("still fuses a bare (non-colon-prefixed) ticker elsewhere in the same token stream", () => {
		const tokens = [colon(), ident("AAPL"), ident("MSFT")];
		expect(rule.match(tokens, 2)).not.toBeNull();
	});

	test("returns null for non-IDENT tokens", () => {
		expect(rule.match([colon()], 0)).toBeNull();
	});

	test("returns null when pos is out of bounds", () => {
		expect(rule.match([ident("AAPL")], 5)).toBeNull();
	});

	test("rule metadata", () => {
		expect(rule.name).toBe("stocks:bare-ticker");
		expect(rule.priority).toBe(20);
	});

	test("allow-list contains only uppercase entries", () => {
		for (const ticker of MAJOR_TICKERS) {
			expect(ticker).toBe(ticker.toUpperCase());
		}
	});
});
