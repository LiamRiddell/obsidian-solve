import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/** The 5 SoulverCore-documented weather query kinds, encoded as the first
 * segment of the query string this package's single async resolver caches
 * on (see WeatherPackage.ts's `WEATHER_FN_IDX` / `createQueryResolver` call
 * — one resolver, one plugin function, kind+city both folded into the
 * query string it scans for). */
export type WeatherQueryKind = "current" | "temperature" | "feelslike" | "high" | "low";

/**
 * Consume a free-form city name: one or more consecutive word tokens
 * (IDENT), joined with single spaces — "New York", "Los Angeles", "Rio de
 * Janeiro". Unlike `time/timezones/CityZones.ts`'s zone lookup, weather has
 * no bundled city table (Open-Meteo's geocoding API resolves arbitrary
 * names), so this consumes GREEDILY until it hits a non-word token
 * (operator, EOF, ...) rather than validating against a known list.
 *
 * Throws if no word token follows at all — "weather in" alone isn't a
 * usable query, and silently emitting an empty-string query would just
 * turn into a confusing "no location found" error one layer down instead
 * of a clear one here.
 */
function consumeCityName(parser: Parser, triggerText: string): string {
	const words: string[] = [];
	while (parser.peek()?.type === "IDENT") {
		words.push(parser.consume().value);
	}
	if (words.length === 0) {
		throw ErrorFactory.parsing(
			"WEATHER_EXPECTED_CITY",
			`Expected a city name after "${triggerText}" (e.g. "${triggerText} London")`,
		);
	}
	return words.join(" ");
}

/**
 * Shared parselet factory for all 5 weather query forms (`weather in`,
 * `temperature in`, `feels like in`, `high in`, `low in`) — triggered on
 * the phrase-fused `WEATHER_IN`/`TEMPERATURE_IN`/`FEELS_LIKE_IN`/`HIGH_IN`/
 * `LOW_IN` tokens (see WeatherPackage.ts's `phrases` field). "weather",
 * "temperature", "high", "low" are all plausible bare variable names (a
 * real regression happened this session from claiming a common word as a
 * bare keyword — see MathPhrasesPackage.ts's "total" note), so every
 * trigger here is the FULL fused phrase, never a bare word, mirroring
 * `time/parselets/TimeInZoneParselet.ts`'s identical reasoning for
 * "time in"/"date in".
 */
export function weatherQueryParselet(kind: WeatherQueryKind, pluginFnIdx: number): PrefixParselet {
	return {
		category: "Weather",
		parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
			const city = consumeCityName(parser, token.value);
			builder.emitOpcode(OpCode.PUSH_STRING);
			builder.emitString(`${kind}:${city}`);
			builder.emitOpcode(OpCode.CALL_PLUGIN);
			builder.emitIndex(pluginFnIdx);
			builder.emitIndex(1);
		},
	};
}
