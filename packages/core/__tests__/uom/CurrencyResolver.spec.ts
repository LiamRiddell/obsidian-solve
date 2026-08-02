import { describe, expect, test, afterEach } from "@jest/globals";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";
import { sharedCurrencyExchange } from "@solve-js/uom/CurrencyExchange";
import { OpCode } from "@solve-js/parser/OpCode";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import type { Token } from "@solve-js/lexer";

/**
 * Direct unit coverage for CurrencyAsyncResolver.preflight()'s bytecode-
 * scanning operand-width table. Full currency-conversion behavior
 * (arithmetic between differently-denominated currencies, explicit "X to
 * Y" conversions) is already covered end-to-end in
 * Issue_CryptoCurrencyArithmeticSilentlyWrong.spec.ts — this file is about
 * a narrower regression: the scanner must skip every opcode's operand
 * bytes at the correct width, or it desyncs and silently stops
 * recognizing currency pairs later in the same bytecode stream.
 */

function bc(ops: number[], numbers: number[] = [], strings: string[] = []): BytecodeProgram {
	return { opcodes: new Uint8Array(ops), numbers: new Float64Array(numbers), strings, hasAsync: false };
}

const NO_TOKENS: Token[] = [];
const NO_SIGNAL = new AbortController().signal;

// preflight() only needs fetchQuery's SYNCHRONOUS return shape (a thenable
// to stash as AsyncCheckResult.resolver) — it never awaits it in these
// tests. Deliberately not invoking the real queryFn: doing so would fire a
// genuine network request (CoinGecko/Frankfurter) on every test run, which
// previously crashed the process with an unhandled rejection once the API
// got rate-limited — see Issue_CryptoCurrencyArithmeticSilentlyWrong.spec.ts.
const FAKE_QUERY_CLIENT = {
	getQueryData: () => undefined,
	fetchQuery: () => Promise.resolve(),
} as any;

describe("CurrencyAsyncResolver operand-width scanning", () => {
	afterEach(() => {
		sharedCurrencyExchange.clearRates();
	});

	test("preflight still detects a currency pair after a CALL_USER_FUNCTION call (operand-width regression)", () => {
		// Models a document that calls a user function (`f(5)`) before doing
		// "0.01 BTC + 1 ETH". CALL_USER_FUNCTION's nameIdx operand is
		// deliberately set to OpCode.CALL_BUILTIN's own numeric value (51),
		// and the first PUSH_NUMBER's numIdx operand to OpCode.PUSH_NUMBER's
		// own value (10) — NOT arbitrary small indices like 0 or 1. If
		// CALL_USER_FUNCTION's case were missing from the operand-width
		// switch, the buggy `default: i++` walk would misread these bytes as
		// real opcodes and jump by THEIR widths instead of just stepping
		// past them. With "boring" operand values that don't collide with
		// any opcode, the buggy walk still ends up advancing the correct
		// total distance one byte at a time and silently self-heals — which
		// is why this test deliberately picks colliding values instead: hand-
		// traced to permanently skip past the real PUSH_STRING("BTC") opcode
		// pre-fix (scanning only ever moves forward, so a skipped opcode is
		// never revisited), and to land on it correctly post-fix.
		const resolver = new CurrencyAsyncResolver();
		const program = bc(
			[
				OpCode.CALL_USER_FUNCTION, OpCode.CALL_BUILTIN, 1,
				OpCode.PUSH_NUMBER, OpCode.PUSH_NUMBER, OpCode.PUSH_STRING, 0, OpCode.UOM_CONVERT,
				OpCode.PUSH_NUMBER, 0, OpCode.PUSH_STRING, 1, OpCode.UOM_CONVERT,
				OpCode.ADD, OpCode.HALT,
			],
			// numbers[10] = 0.01 (BTC amount, indexed via the poisoned numIdx
			// above), numbers[0] = 1 (ETH amount, an ordinary boring index).
			[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01],
			["BTC", "ETH"],
		);

		const result = resolver.preflight(NO_TOKENS, program, "currency", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(result).not.toBeNull();
		expect(result!.queryKey).toContain("BTC");
		expect(result!.queryKey).toContain("ETH");
	});
});
