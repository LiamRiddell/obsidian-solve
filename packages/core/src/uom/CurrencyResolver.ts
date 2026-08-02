/**
 * Currency async resolver — bridges CurrencyExchangeService to the
 * IAsyncResolver interface for the Suspense architecture.
 *
 * Uses TanStack Query (injected via queryClient) as the single cache layer.
 */
import type { QueryClient } from "@tanstack/query-core";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import type { Value } from "@solve-js/vm/Value";
import { numberValue } from "@solve-js/vm/Value";
import {
	currencyExchangeService,
	CurrencyExchangeService,
} from "@solve-js/uom/CurrencyExchange";
import type { IAsyncResolver, AsyncCheckResult } from "@solve-js/resolvers/ResolverRegistry";

const CURRENCY_NS = "currency";

export class CurrencyAsyncResolver implements IAsyncResolver {
	readonly namespace = CURRENCY_NS;

	private exchange: CurrencyExchangeService;

	constructor(exchange?: CurrencyExchangeService) {
		this.exchange = exchange ?? currencyExchangeService;
	}

	preflight(_tokens: Token[], bytecode: BytecodeProgram, packageId: string, signal: AbortSignal, queryClient: QueryClient): AsyncCheckResult | null {
		const { opcodes, strings } = bytecode;
		const len = opcodes.length;
		let i = 0;

		let lastStrIdx = -1;
		let prevStrIdx = -1;

		while (i < len) {
			const op = opcodes[i] as OpCode;

			if (op === OpCode.PUSH_STRING) {
				prevStrIdx = lastStrIdx;
				lastStrIdx = opcodes[i + 1];
			}

			// Explicit "X to Y"/"X in Y" conversions (UOM_CONVERT_IN/_TO) are
			// the obvious case, but arithmetic directly on two differently-
			// denominated currency literals — "0.01 BTC + 1 ETH" — needs the
			// exact same preflight fetch and previously never got it: this
			// scanner only looked for the CONVERT opcodes, so ADD/SUB/MUL/DIV
			// between two currency UOMs skipped preflight entirely, ran with
			// no cached rate, and fell through to the VM's silent-wrong-math
			// fallback instead of ever reaching a network fetch.
			const isCurrencyCombiningOp =
				op === OpCode.UOM_CONVERT_IN || op === OpCode.UOM_CONVERT_TO ||
				op === OpCode.ADD || op === OpCode.SUB || op === OpCode.MUL || op === OpCode.DIV;
			if (isCurrencyCombiningOp) {
				if (prevStrIdx >= 0 && lastStrIdx >= 0) {
					const fromUnit = strings[prevStrIdx];
					const toUnit = strings[lastStrIdx];

					if (
						this.exchange.isCurrency(fromUnit) &&
						this.exchange.isCurrency(toUnit) &&
						fromUnit.toUpperCase() !== toUnit.toUpperCase()
					) {
						const syncRate = this.exchange.getRateSync(fromUnit, toUnit);
						if (syncRate === null) {
							const fromUpper = fromUnit.toUpperCase();
							const toUpper = toUnit.toUpperCase();

							// Check TanStack Query cache
							const cacheKey = [CURRENCY_NS, fromUpper, toUpper];
							if (queryClient.getQueryData(cacheKey) !== undefined) {
								i++;
								continue;
							}

							// Fetch via TanStack Query (dedup + retry automatic)
							const resolver = queryClient.fetchQuery({
								queryKey: cacheKey,
								queryFn: ({ signal: qSignal }) => {
									return this.exchange.getRate(fromUnit, toUnit, qSignal).then((rate) => numberValue(rate));
								},
								staleTime: 5 * 60 * 1000,
							});

							return { queryKey: cacheKey.join(":"), resolver, packageId, signal, metadata: { fromUnit, toUnit } };
						}
					}
				}
			}

			switch (op) {
				case OpCode.PUSH_NUMBER: case OpCode.PUSH_BIGINT: case OpCode.PUSH_HEX:
				case OpCode.PUSH_STRING: case OpCode.PUSH_BOOLEAN:
				case OpCode.LOAD_VAR: case OpCode.STORE_VAR:
				case OpCode.LOAD_GLOBAL_VAR: case OpCode.STORE_GLOBAL_VAR:
				case OpCode.DEFINE_USER_FUNCTION:
					i += 2; break;
				case OpCode.CALL_PLUGIN: case OpCode.CALL_BUILTIN: case OpCode.CALL_USER_FUNCTION:
					i += 3; break;
				case OpCode.MAT_NEW:
					i += 3; break;
				case OpCode.MAP_INVOKE: case OpCode.REDUCE_INVOKE:
					i += 4; break;
				default:
					i++; break;
			}
		}

		return null;
	}

	destroy(): void {
		// Cache cleared by ResolverRegistry.unregister() via removeQueries({ queryKey: ["currency"] })
	}
}
