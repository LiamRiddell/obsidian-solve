/**
 * KnowledgePackage integration tests.
 *
 * Like Stocks, there is no free equivalent of Wolfram|Alpha, so these
 * tests never hit a real network endpoint — they cover the honest
 * "not configured" error path AND a fully working path using a
 * test-provided mock `answerQuery` function, plus the package's
 * distinctive `<query> = ?` raw-line grammar end-to-end.
 */
import { describe, expect, test } from "@jest/globals";
import { QueryClient } from "@tanstack/query-core";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType, stringValue } from "@solve-js/vm/Value";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { createKnowledgePackage } from "@solve-js/packages/knowledge";

function buildQueryBytecode(query: string, fnIdx: number) {
	const builder = new BytecodeBuilder();
	builder.emitOpcode(OpCode.PUSH_STRING);
	builder.emitString(query);
	builder.emitOpcode(OpCode.CALL_PLUGIN);
	builder.emitByte(fnIdx);
	builder.emitByte(1);
	builder.emitOpcode(OpCode.HALT);
	return builder.build();
}

describe("createKnowledgePackage — descriptor shape", () => {
	test("is NOT included in BUILTIN_PACKAGES (needs a host-supplied answerQuery to do anything useful)", () => {
		const pkg = createKnowledgePackage();
		expect(BUILTIN_PACKAGES).not.toContain(pkg);
		expect(BUILTIN_PACKAGES.some((p) => p.name === "solve-knowledge")).toBe(false);
	});

	test("registers two rawLinePatterns rules — the leading 'search:'/'ask:'/'google:' form and the trailing '= ?' form", () => {
		const pkg = createKnowledgePackage();
		const rules = pkg.lexerVocabulary?.rawLinePatterns ?? [];
		expect(rules).toHaveLength(2);
		expect(rules.every((r) => r.tokenType === "KNOWLEDGE_QUERY")).toBe(true);
		expect("search: distance to the moon".match(rules[0].pattern)?.[1].trim()).toBe("distance to the moon");
		expect("distance to the moon = ?".match(rules[1].pattern)?.[1].trim()).toBe("distance to the moon");
	});

	test("each createKnowledgePackage() call allocates a fresh plugin-function index", () => {
		const pkgA = createKnowledgePackage();
		const pkgB = createKnowledgePackage();
		expect(pkgA.pluginFunctions![0].index).not.toBe(pkgB.pluginFunctions![0].index);
	});
});

describe("createKnowledgePackage — honest 'not configured' error (no answerQuery supplied)", () => {
	test("resolves to a KNOWLEDGE_NOT_CONFIGURED error Value, never a hallucinated answer", async () => {
		const pkg = createKnowledgePackage();
		const qc = new QueryClient();
		const fnIdx = pkg.pluginFunctions![0].index;
		const resolver = pkg.asyncResolvers![0];

		const bytecode = buildQueryBytecode("distance to the moon", fnIdx);
		const result = resolver.preflight!([], bytecode, "test-pkg", new AbortController().signal, qc);
		expect(result).not.toBeNull();

		const resolved = await result!.resolver;
		expect(resolved.type).toBe(ValueType.Error);
		expect(resolved.value).toBe("KNOWLEDGE_NOT_CONFIGURED");
		expect(String(resolved.unit)).toMatch(/not configured/i);
		expect(String(resolved.unit)).toMatch(/answerQuery/);

		qc.clear();
	});
});

describe("createKnowledgePackage — working path with a test-provided mock answerQuery", () => {
	test("answerQuery receives the exact query text and its answer becomes a String Value", async () => {
		const answerQuery = jest.fn(async (query: string) => {
			expect(query).toBe("distance to the moon");
			return "approximately 384,400 km";
		});
		const pkg = createKnowledgePackage({ answerQuery });
		const qc = new QueryClient();
		const fnIdx = pkg.pluginFunctions![0].index;
		const resolver = pkg.asyncResolvers![0];

		const bytecode = buildQueryBytecode("distance to the moon", fnIdx);
		const result = resolver.preflight!([], bytecode, "test-pkg", new AbortController().signal, qc);
		const resolved = await result!.resolver;

		expect(answerQuery).toHaveBeenCalledTimes(1);
		expect(resolved.type).toBe(ValueType.String);
		expect(resolved.value).toBe("approximately 384,400 km");

		qc.clear();
	});
});

describe("createKnowledgePackage — ExpressionEngine integration (real lexer/parser/VM pipeline)", () => {
	function createEngine(config: Parameters<typeof createKnowledgePackage>[0] = {}) {
		const pkg = createKnowledgePackage(config);
		const engine = new ExpressionEngine("en", false, undefined, undefined, [...BUILTIN_PACKAGES, pkg]);
		return { engine, pkg };
	}

	test("'distance to the moon = ?' lexes to ONE KNOWLEDGE_QUERY token and compiles to CALL_PLUGIN bytecode", () => {
		const { engine, pkg } = createEngine();
		const fnIdx = pkg.pluginFunctions![0].index;
		engine.queryClient.setQueryData(["knowledge", "distance to the moon"], stringValue("approximately 384,400 km"));

		const result = engine.evaluateLineWithDebug(1, "distance to the moon = ?");

		expect(result.error).toBeUndefined();
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0].type).toBe("KNOWLEDGE_QUERY");
		expect(result.tokens[0].value).toBe("distance to the moon");
		expect(result.program.opcodes[0]).toBe(OpCode.PUSH_STRING);
		expect(result.program.opcodes[2]).toBe(OpCode.CALL_PLUGIN);
		expect(result.program.opcodes[3]).toBe(fnIdx);
		expect(result.value.type).toBe(ValueType.String);
		expect(result.value.value).toBe("approximately 384,400 km");

		engine.clear();
	});

	test("returns Pending when the cache is empty (real fetch not yet resolved)", () => {
		const { engine } = createEngine();
		const result = engine.evaluateLineWithDebug(1, "population of Tokyo = ?");

		expect(result.error).toBeUndefined();
		expect(result.value.type).toBe(ValueType.Pending);

		engine.clear();
	});

	test("an ordinary arithmetic expression is completely unaffected by the raw-line pattern", () => {
		const { engine } = createEngine();
		const result = engine.evaluateLineWithDebug(1, "2 + 2");

		expect(result.error).toBeUndefined();
		expect(result.value.value).toBe(4);
		expect(result.tokens.some((t: any) => t.type === "KNOWLEDGE_QUERY")).toBe(false);

		engine.clear();
	});

	test("'=?' with no space also matches", () => {
		const { engine } = createEngine();
		engine.queryClient.setQueryData(["knowledge", "speed of light"], stringValue("299,792 km/s"));
		const result = engine.evaluateLineWithDebug(1, "speed of light=?");

		expect(result.error).toBeUndefined();
		expect(result.tokens[0].type).toBe("KNOWLEDGE_QUERY");
		expect(result.value.value).toBe("299,792 km/s");

		engine.clear();
	});

	test.each(["search", "ask", "google"])("'%s: <query>' resolves the same way as '<query> = ?'", (keyword) => {
		const { engine } = createEngine();
		engine.queryClient.setQueryData(["knowledge", "distance to the moon"], stringValue("approximately 384,400 km"));

		const result = engine.evaluateLineWithDebug(1, `${keyword}: distance to the moon`);

		expect(result.error).toBeUndefined();
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0].type).toBe("KNOWLEDGE_QUERY");
		expect(result.tokens[0].value).toBe("distance to the moon");
		expect(result.value.type).toBe(ValueType.String);
		expect(result.value.value).toBe("approximately 384,400 km");

		engine.clear();
	});

	test("'search:' is case-insensitive and tolerates extra spacing ('Search  :   query')", () => {
		const { engine } = createEngine();
		engine.queryClient.setQueryData(["knowledge", "distance to the moon"], stringValue("approximately 384,400 km"));

		const result = engine.evaluateLineWithDebug(1, "Search  :   distance to the moon");

		expect(result.error).toBeUndefined();
		expect(result.value.value).toBe("approximately 384,400 km");

		engine.clear();
	});

	test("regression guard: a real ':search = 5' variable is unaffected — 'search + 3' still reads the variable, not a knowledge query", () => {
		const { engine } = createEngine();
		engine.evaluateExpression(":search = 5");
		const [value] = engine.evaluateExpression("search + 3");

		expect(value.type).toBe(ValueType.Number);
		expect(value.toNumber()).toBe(8);
	});

	test("regression guard: bare 'search' (no colon, undefined) is a plain undefined-variable error, not a knowledge query", () => {
		const { engine } = createEngine();
		expect(() => engine.evaluateExpression("search")).toThrow(/undefined variable/i);
	});
});
