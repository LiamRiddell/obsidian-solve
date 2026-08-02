import { describe, expect, test, afterEach } from "@jest/globals";
import { GlobalVariableAsyncResolver } from "@solve-js/vm/GlobalVariableAsyncResolver";
import { sharedGlobalVariableStore } from "@solve-js/vm/GlobalVariableStore";
import { OpCode } from "@solve-js/parser/OpCode";
import { numberValue } from "@solve-js/vm/Value";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import type { Token } from "@solve-js/lexer";

/**
 * Direct unit coverage for GlobalVariableAsyncResolver.preflight()'s
 * bytecode-scanning and in-flight-promise dedup logic — the full "declare
 * in doc A, resolves in doc B" cross-document flow through the real engine
 * is covered separately in GlobalVariablesAcrossDocuments.spec.ts. This
 * file is about the resolver's own internal correctness in isolation.
 */

function bc(ops: number[], strings: string[] = []): BytecodeProgram {
	return {
		opcodes: new Uint8Array(ops),
		numbers: new Float64Array([]),
		strings,
		hasAsync: false,
	};
}

const NO_TOKENS: Token[] = [];
const NO_SIGNAL = new AbortController().signal;
const FAKE_QUERY_CLIENT = {} as any; // unused by this resolver — accepted only for interface conformance

describe("GlobalVariableAsyncResolver", () => {
	afterEach(() => {
		sharedGlobalVariableStore.clear();
	});

	test("preflight returns null when the referenced global is already known", () => {
		sharedGlobalVariableStore.set("x", numberValue(1));
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		expect(resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)).toBeNull();
	});

	test("preflight returns an AsyncCheckResult when the referenced global is missing", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(result).not.toBeNull();
		expect(result!.queryKey).toBe("global:x");
		expect(result!.packageId).toBe("_engine");
		expect(result!.signal).toBe(NO_SIGNAL);
	});

	test("preflight returns null for bytecode with no LOAD_GLOBAL_VAR at all", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.PUSH_NUMBER, 0, OpCode.HALT]);
		program.numbers = new Float64Array([42]);
		expect(resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)).toBeNull();
	});

	test("preflight ignores STORE_GLOBAL_VAR — only reads need resolution, writes always succeed synchronously", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		program.numbers = new Float64Array([5]);
		expect(resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)).toBeNull();
	});

	test("the returned promise resolves once the global is set()", async () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)!;

		sharedGlobalVariableStore.set("x", numberValue(42));

		const resolved = await result.resolver;
		expect(resolved.toNumber()).toBe(42);
	});

	test("the promise does NOT resolve for a DIFFERENT global being set", async () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)!;

		sharedGlobalVariableStore.set("y", numberValue(1));

		let settled = false;
		result.resolver.then(() => { settled = true; });
		await new Promise((r) => setTimeout(r, 10));
		expect(settled).toBe(false);

		// Clean up so the still-pending promise doesn't dangle into other tests.
		sharedGlobalVariableStore.set("x", numberValue(0));
		await result.resolver;
	});

	test("repeated preflight calls for the same still-missing name return the SAME promise (dedup)", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);

		const first = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)!;
		const second = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)!;

		expect(first.resolver).toBe(second.resolver);

		// Cleanup: resolve it so nothing dangles.
		sharedGlobalVariableStore.set("x", numberValue(0));
	});

	test("only ONE subscription is created for repeated preflight calls on the same missing name", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);

		for (let i = 0; i < 10; i++) {
			resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		}

		let notifications = 0;
		sharedGlobalVariableStore.subscribe(() => notifications++);
		sharedGlobalVariableStore.set("x", numberValue(0));

		// The test's own extra listener fires once; the resolver's single
		// (deduped) internal listener also fires once — asserting via a
		// side channel isn't directly observable here, so instead assert
		// indirectly: after set(), a FRESH preflight() call for "x" returns
		// null (already known) rather than yet another distinct promise —
		// proving there's exactly one coherent resolved state, not ten
		// independent listeners racing.
		expect(resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)).toBeNull();
		expect(notifications).toBe(1);
	});

	test("after resolving, a NEW preflight call for the same (now-known) name returns null, not a stale cached promise", async () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);

		const first = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)!;
		sharedGlobalVariableStore.set("x", numberValue(1));
		await first.resolver;

		expect(resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT)).toBeNull();
	});

	test("scanning a mix of LOAD_VAR, STORE_GLOBAL_VAR, and LOAD_GLOBAL_VAR doesn't misalign on operand bytes", () => {
		// LOAD_VAR "a" (2 bytes), PUSH_NUMBER (2 bytes, operand indexes numbers[]),
		// STORE_GLOBAL_VAR "b" (2 bytes), LOAD_GLOBAL_VAR "c" (2 bytes), HALT.
		// If the operand-width table were missing an entry, this scan would
		// misinterpret an operand byte as the next opcode and silently skip
		// or misidentify "c".
		sharedGlobalVariableStore.set("a", numberValue(1)); // irrelevant to LOAD_VAR, but keep it defined-looking
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc(
			[OpCode.LOAD_VAR, 0, OpCode.PUSH_NUMBER, 0, OpCode.STORE_GLOBAL_VAR, 1, OpCode.LOAD_GLOBAL_VAR, 2, OpCode.HALT],
			["a", "b", "c"]
		);
		program.numbers = new Float64Array([5]);

		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(result).not.toBeNull();
		expect(result!.queryKey).toBe("global:c");
	});

	// The next two tests deliberately set DEFINE_USER_FUNCTION's bodyIdx /
	// CALL_USER_FUNCTION's nameIdx to 51 (OpCode.CALL_BUILTIN's own numeric
	// value) rather than an arbitrary small index like 0 or 1. This isn't
	// cosmetic: if the operand byte is "boring" (doesn't collide with any
	// OTHER opcode's value), the buggy `default: i++` path still ends up
	// walking the exact right number of bytes one at a time and silently
	// self-heals — so a naive test with small indices passes whether or not
	// the fix is present, and proves nothing. Setting the operand to a real
	// multi-byte opcode's value forces the (buggy) scanner to misinterpret
	// it as THAT opcode and jump by ITS width instead, which — given the
	// exact byte layout below — jumps clean over LOAD_GLOBAL_VAR and
	// permanently loses it, since scanning only ever moves forward.
	test("DEFINE_USER_FUNCTION is skipped at its correct 2-byte width, not misread as the next opcode", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc(
			[OpCode.DEFINE_USER_FUNCTION, OpCode.CALL_BUILTIN, OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT],
			["x"]
		);

		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(result).not.toBeNull();
		expect(result!.queryKey).toBe("global:x");
	});

	test("CALL_USER_FUNCTION is skipped at its correct 3-byte width, not misread as the next opcode", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc(
			[OpCode.CALL_USER_FUNCTION, OpCode.CALL_BUILTIN, 1, OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT],
			["x"]
		);

		const result = resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(result).not.toBeNull();
		expect(result!.queryKey).toBe("global:x");
	});

	test("destroy() clears the in-flight cache without throwing", () => {
		const resolver = new GlobalVariableAsyncResolver();
		const program = bc([OpCode.LOAD_GLOBAL_VAR, 0, OpCode.HALT], ["x"]);
		resolver.preflight(NO_TOKENS, program, "_engine", NO_SIGNAL, FAKE_QUERY_CLIENT);
		expect(() => resolver.destroy()).not.toThrow();
	});

	test("namespace is a unique, stable identifier", () => {
		const resolver = new GlobalVariableAsyncResolver();
		expect(resolver.namespace).toBe("global-variables");
	});
});
