/**
 * Currency async resolver — bridges CurrencyExchangeService to the
 * IAsyncResolver interface for the Suspense architecture.
 *
 * When an expression like "$100 in GBP" is compiled, this resolver's
 * preflight() scans the bytecode for UOM_CONVERT_IN / UOM_CONVERT_TO
 * opcodes and checks if the needed currency rate is cached. If not,
 * it initiates a fetch and returns an AsyncCheckResult so the engine
 * can return a Pending result immediately.
 */
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import type { Value } from "@solve-js/vm/Value";
import { numberValue } from "@solve-js/vm/Value";
import { AsyncResultCache } from "@solve-js/cache/AsyncResultCache";
import {
	currencyExchangeService,
	CurrencyExchangeService,
} from "@solve-js/uom/CurrencyExchange";
import type { IAsyncResolver, AsyncCheckResult } from "@solve-js/resolvers/ResolverRegistry";

export class CurrencyAsyncResolver implements IAsyncResolver {
	readonly namespace = "currency";

	private exchange: CurrencyExchangeService;

	constructor(exchange?: CurrencyExchangeService) {
		this.exchange = exchange ?? currencyExchangeService;
	}

	/**
	 * Scan bytecode for UOM_CONVERT_IN / UOM_CONVERT_TO opcodes.
	 *
	 * These opcodes have the pattern:
	 *   UOM_CONVERT_IN:  [..., PUSH_NUMBER val, PUSH_STRING fromUnit, PUSH_STRING toUnit, UOM_CONVERT_IN]
	 *   UOM_CONVERT_TO:  [..., PUSH_NUMBER val, PUSH_STRING fromUnit, PUSH_STRING toUnit, UOM_CONVERT_TO]
	 *
	 * We track the last two PUSH_STRING indices during the forward scan.
	 * When a conversion opcode is hit, those two strings are the currency codes.
	 * If the rate isn't cached, we create a fetch Promise and return an AsyncCheckResult.
	 */
	preflight(_tokens: Token[], bytecode: BytecodeProgram, packageId: string, signal: AbortSignal): AsyncCheckResult | null {
		const { opcodes, strings } = bytecode;
		const len = opcodes.length;
		let i = 0;

		// Track the last two PUSH_STRING indices during the forward scan.
		// When we hit UOM_CONVERT_IN/TO, these are the fromUnit and toUnit.
		let lastStrIdx = -1;
		let prevStrIdx = -1;

		while (i < len) {
			const op = opcodes[i] as OpCode;

		// Track only PUSH_STRING operands — they carry unit/currency codes.
		// LOAD_VAR and STORE_VAR operands are variable names, not units,
		// so we intentionally exclude them to avoid false negatives.
		if (op === OpCode.PUSH_STRING) {
			prevStrIdx = lastStrIdx;
			lastStrIdx = opcodes[i + 1];
		}

			// Check UoM conversion opcodes
			if (op === OpCode.UOM_CONVERT_IN || op === OpCode.UOM_CONVERT_TO) {
				if (prevStrIdx >= 0 && lastStrIdx >= 0) {
					const fromUnit = strings[prevStrIdx];
					const toUnit = strings[lastStrIdx];

					// Only handle currency pairs where the rate is truly unavailable.
					// If CurrencyExchangeService has a fallback rate (synchronous),
					// let the VM use it — no need to preflight/suspend.
					if (
						this.exchange.isCurrency(fromUnit) &&
						this.exchange.isCurrency(toUnit) &&
						fromUnit.toUpperCase() !== toUnit.toUpperCase()
					) {
				const syncRate = this.exchange.getRateSync(fromUnit, toUnit);
				if (syncRate !== null) {
					// Rate is available synchronously — let VM use it.
					// Fall through to the switch below which advances i.
				} else {
					const cacheKey = `currency:${fromUnit.toUpperCase()}:${toUnit.toUpperCase()}`;

					// Already resolved?
					if (AsyncResultCache.has(packageId, cacheKey)) {
						// Rate is cached — preflight passes, continue scanning
						i++;
						continue;
					}

					// Already in-flight?
					if (AsyncResultCache.isInFlight(packageId, cacheKey)) {
						const resolver = AsyncResultCache.getInFlight(packageId, cacheKey)!;
						return { queryKey: cacheKey, resolver, packageId, signal, metadata: { fromUnit, toUnit } };
					}

					// Start fetch
					const resolver: Promise<Value> = this.exchange
						.getRate(fromUnit, toUnit)
						.then((rate) => numberValue(rate));

					return { queryKey: cacheKey, resolver, packageId, signal, metadata: { fromUnit, toUnit } };
				}
					}
				}
			}

			// Reset string tracking on value-producing opcodes that push a new
			// value and break the string chain. When the next PUSH_STRING arrives,
			// it will naturally replace lastStrIdx with prevStrIdx shifting back.
			// No action needed — the sliding window automatically handles this.

			// Advance past this opcode (skip operands for multi-byte opcodes)
			switch (op) {
				case OpCode.PUSH_NUMBER:
				case OpCode.PUSH_BIGINT:
				case OpCode.PUSH_HEX:
				case OpCode.PUSH_STRING:
				case OpCode.PUSH_BOOLEAN:
				case OpCode.LOAD_VAR:
				case OpCode.STORE_VAR:
					i += 2; // opcode + 1-byte operand
					break;
				case OpCode.CALL_PLUGIN:
				case OpCode.CALL_BUILTIN:
					i += 3; // opcode + fnIdx + argCount
					break;
				case OpCode.ARR_NEW:
					i += 2; // opcode + component count
					break;
				default:
					i++;
					break;
			}
		}

		return null; // All rates cached
	}

	destroy(): void {
		// Clear all currency cache entries
		AsyncResultCache.clearPrefix("currency:");
	}
}
