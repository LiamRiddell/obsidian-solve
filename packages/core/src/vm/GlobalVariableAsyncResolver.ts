import type { QueryClient } from "@tanstack/query-core";
import type { Token } from "@solve-js/lexer";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import type { Value } from "@solve-js/vm/Value";
import type { IAsyncResolver, AsyncCheckResult } from "@solve-js/resolvers/ResolverRegistry";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";

/**
 * Async resolver for `global :name` reads that aren't yet known — i.e. no
 * currently-loaded document has run `global :name = value` for this name.
 *
 * Plugs into the engine's EXISTING async-resolution pipeline (the same one
 * CurrencyAsyncResolver/OsrsAsyncResolver use for currency rates and OSRS
 * prices): `preflight()` runs BEFORE the VM, and if a referenced global is
 * missing, returns an `AsyncCheckResult` — the engine immediately shows a
 * Pending value and, when the returned promise resolves, re-executes the
 * line via the same batching/DAG/event-stream machinery already built and
 * tested for currency. No new UI wiring is needed: `ExpressionResultWidget`
 * already renders Pending as a spinner.
 *
 * Unlike currency/OSRS, there is no network fetch here and no timeout —
 * the promise for a missing name resolves the moment ANY loaded document
 * calls `global :name = value` (via GlobalVariableStore.subscribe()), and
 * simply stays pending forever if nothing ever does. This mirrors how an
 * unresolved external reference in a real spreadsheet behaves, and is the
 * deliberate design choice confirmed for this feature (no artificial
 * "give up and error" timer).
 */
export class GlobalVariableAsyncResolver implements IAsyncResolver {
	readonly namespace = "global-variables";

	/**
	 * In-flight (not-yet-resolved) promises, keyed by variable name.
	 *
	 * Without this, every re-evaluation of a still-pending line (every
	 * keystroke elsewhere in the document, every scroll, every unrelated
	 * evaluate() call) would call preflight() again and — without dedup —
	 * create a BRAND NEW GlobalVariableStore subscription each time. Since
	 * "never declared" is an explicitly supported, indefinitely-pending
	 * outcome (no timeout), those listeners would never naturally clean
	 * themselves up, growing unboundedly. This cache means repeated
	 * preflight() calls for the same still-missing name return the exact
	 * same promise (and therefore the same single subscription) every time.
	 *
	 * TanStack Query's fetchQuery() gives currency/OSRS this same dedup
	 * for free; this resolver doesn't use TanStack Query (its "cache" is
	 * GlobalVariableStore, not a network response), so it needs its own.
	 */
	private pending = new Map<string, Promise<Value>>();

	preflight(_tokens: Token[], bytecode: BytecodeProgram, packageId: string, signal: AbortSignal, _queryClient: QueryClient): AsyncCheckResult | null {
		const { opcodes, strings } = bytecode;
		const len = opcodes.length;
		let i = 0;

		while (i < len) {
			const op = opcodes[i] as OpCode;

			if (op === OpCode.LOAD_GLOBAL_VAR) {
				const varName = strings[opcodes[i + 1]];
				if (!sharedGlobalVariableStore.has(varName)) {
					return this.pendingResultFor(varName, packageId, signal);
				}
			}

			// Every opcode's operand width, needed to correctly skip operand
			// bytes while scanning — mirrors the identical table already
			// duplicated in CurrencyAsyncResolver/OsrsAsyncResolver (this
			// codebase has no shared bytecode-walking utility yet). Keep
			// this in sync with those two files' switch blocks: an opcode
			// missing here (or there) causes a resolver to misread the next
			// opcode's operand byte as if it were itself an opcode, silently
			// corrupting the rest of that resolver's scan for ANY bytecode
			// that happens to also contain this opcode.
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

	private pendingResultFor(varName: string, packageId: string, signal: AbortSignal): AsyncCheckResult {
		let resolver = this.pending.get(varName);
		if (!resolver) {
			resolver = new Promise<Value>((resolve) => {
				const unsubscribe = sharedGlobalVariableStore.subscribe((name, value) => {
					if (name !== varName) return;
					unsubscribe();
					this.pending.delete(varName);
					resolve(value);
				});
			});
			this.pending.set(varName, resolver);
		}

		return {
			queryKey: `global:${varName}`,
			resolver,
			packageId,
			signal,
			metadata: { varName },
		};
	}

	destroy(): void {
		// The underlying GlobalVariableStore subscriptions self-remove on
		// resolve; nothing here needs to force-unsubscribe in-flight ones —
		// letting an already-pending global keep waiting even after this
		// particular resolver instance is torn down (e.g. package
		// unregister/re-register elsewhere) is harmless, since the
		// subscription only ever touches sharedGlobalVariableStore itself.
		this.pending.clear();
	}
}
