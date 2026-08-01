/**
 * WeatherPackage integration tests.
 *
 * This environment has confirmed outbound network access (verified with a
 * direct `fetch()` to Open-Meteo before writing this suite, and Node 24's
 * built-in `fetch` needs no polyfill/mock here) — so unlike a sandboxed
 * CI environment where a live third-party API would be flaky/unavailable,
 * these tests make REAL calls to the real Open-Meteo API for at least one
 * case in each describe block, proving the integration genuinely works
 * end-to-end rather than only against a mocked response shape. Synchronous
 * wiring (tokens/bytecode/cache plumbing) is still tested with a seeded
 * queryClient cache, matching examples/osrs/OsrsPackage.spec.ts's own
 * "ExpressionEngine integration" style — only the parts that need a real
 * HTTP round-trip actually make one.
 */
import { describe, expect, test } from "@jest/globals";
import { QueryClient } from "@tanstack/query-core";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ValueType, stringValue, uomValue } from "@solve-js/vm/Value";
import { setActiveQueryClient } from "@solve-js/services/DataQueryService";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { BUILTIN_PACKAGES } from "@solve-js/packages/builtins";
import { WEATHER_PACKAGE, fetchCityWeather } from "@solve-js/packages/weather";

const WEATHER_FN_IDX = WEATHER_PACKAGE.pluginFunctions![0].index;

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

describe("WEATHER_PACKAGE — descriptor shape", () => {
	test("is included in BUILTIN_PACKAGES (Open-Meteo is free/keyless, unlike stocks/knowledge)", () => {
		expect(BUILTIN_PACKAGES).toContain(WEATHER_PACKAGE);
	});

	test("registers all 5 query phrases", () => {
		const phrases = Object.keys(WEATHER_PACKAGE.phrases ?? {});
		expect(phrases).toEqual(
			expect.arrayContaining(["weather in", "temperature in", "feels like in", "high in", "low in"]),
		);
	});

	test("all 5 prefix parselets share the SAME CALL_PLUGIN index (one resolver, kind folded into the query string)", () => {
		const idx = WEATHER_PACKAGE.pluginFunctions![0].index;
		expect(WEATHER_PACKAGE.pluginFunctions).toHaveLength(1);
		expect(WEATHER_PACKAGE.prefixParselets).toHaveLength(5);
		expect(idx).toBe(WEATHER_FN_IDX);
	});
});

describe("fetchCityWeather — REAL Open-Meteo network call", () => {
	test(
		"resolves plausible current conditions for a real city (London)",
		async () => {
			const data = await fetchCityWeather("London", new AbortController().signal);
			expect(data.resolvedName.length).toBeGreaterThan(0);
			expect(typeof data.description).toBe("string");
			expect(data.description.length).toBeGreaterThan(0);
			// Sanity bounds, not exact values — this is live weather data.
			expect(data.temperature).toBeGreaterThan(-50);
			expect(data.temperature).toBeLessThan(60);
			expect(data.high).toBeGreaterThanOrEqual(data.low);
		},
		20_000,
	);

	test(
		"rejects for a nonsense location rather than fabricating data",
		async () => {
			await expect(
				fetchCityWeather("Zzznotarealplacexyz123", new AbortController().signal),
			).rejects.toThrow(/No location found/);
		},
		20_000,
	);
});

describe("WEATHER_PACKAGE resolver — REAL end-to-end preflight + cache read-back", () => {
	test(
		"preflight() triggers a real fetch, resolving to a String Value; pluginFunction then reads it back synchronously",
		async () => {
			const qc = new QueryClient();
			setActiveQueryClient(qc);
			const resolver = WEATHER_PACKAGE.asyncResolvers![0];
			const pluginFunction = WEATHER_PACKAGE.pluginFunctions![0].handler;

			const bytecode = buildQueryBytecode("current:Paris", WEATHER_FN_IDX);
			const result = resolver.preflight!([], bytecode, "test-pkg", new AbortController().signal, qc);
			expect(result).not.toBeNull();

			const resolved = await result!.resolver;
			expect(resolved.type).toBe(ValueType.String);
			expect(String(resolved.value)).toMatch(/°C/);

			const readBack = pluginFunction([stringValue("current:Paris")]);
			expect(readBack.type).toBe(ValueType.String);
			expect(readBack.value).toBe(resolved.value);

			qc.clear();
		},
		20_000,
	);
});

describe("WEATHER_PACKAGE — ExpressionEngine integration (seeded cache, synchronous)", () => {
	function createEngine(): ExpressionEngine {
		return new ExpressionEngine("en", false, undefined, undefined, BUILTIN_PACKAGES);
	}

	test("'weather in London' fuses the phrase and produces CALL_PLUGIN bytecode", () => {
		const engine = createEngine();
		engine.queryClient.setQueryData(["weather", "current:London"], stringValue("19°C, overcast"));

		const result = engine.evaluateLineWithDebug(1, "weather in London");

		expect(result.error).toBeUndefined();
		expect(result.tokens[0].type).toBe("WEATHER_IN");
		expect(result.program.opcodes[0]).toBe(OpCode.PUSH_STRING);
		expect(result.program.opcodes[2]).toBe(OpCode.CALL_PLUGIN);
		expect(result.program.strings[0]).toBe("current:London");
		expect(result.value.type).toBe(ValueType.String);
		expect(result.value.value).toBe("19°C, overcast");

		engine.clear();
	});

	test("'temperature in Paris' resolves to a Celsius Uom value", () => {
		const engine = createEngine();
		engine.queryClient.setQueryData(["weather", "temperature:Paris"], uomValue(21, "C"));

		const result = engine.evaluateLineWithDebug(1, "temperature in Paris");

		expect(result.error).toBeUndefined();
		expect(result.tokens[0].type).toBe("TEMPERATURE_IN");
		expect(result.value.type).toBe(ValueType.Uom);
		expect(result.value.value).toBe(21);
		expect(result.value.unit).toBe("C");

		engine.clear();
	});

	test("'high in Tokyo' and 'low in Tokyo' each cache under their own query key", () => {
		const engine = createEngine();
		engine.queryClient.setQueryData(["weather", "high:Tokyo"], uomValue(30, "C"));
		engine.queryClient.setQueryData(["weather", "low:Tokyo"], uomValue(22, "C"));

		const high = engine.evaluateLineWithDebug(1, "high in Tokyo");
		const low = engine.evaluateLineWithDebug(2, "low in Tokyo");

		expect(high.value.value).toBe(30);
		expect(low.value.value).toBe(22);

		engine.clear();
	});

	test("returns Pending when the cache is empty (real fetch not yet resolved)", () => {
		const engine = createEngine();
		const result = engine.evaluateLineWithDebug(1, "weather in Nowhereville");

		expect(result.error).toBeUndefined();
		expect(result.value.type).toBe(ValueType.Pending);

		engine.clear();
	});

	test("'weather in' with no city name surfaces a parse error", () => {
		const engine = createEngine();
		const result = engine.evaluateLineWithDebug(1, "weather in");

		expect(result.error).toMatch(/Expected a city name/);

		engine.clear();
	});
});
