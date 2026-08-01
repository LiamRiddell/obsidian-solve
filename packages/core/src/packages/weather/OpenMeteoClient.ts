import { createTimeoutSignal } from "@solve-js/utilities/TimeoutSignal";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { describeWeatherCode } from "./WmoWeatherCodes";

/**
 * Error codes for this package. Co-located with the package rather than
 * unioned into `errors/ErrorCode.ts`'s core catalog (that catalog is scoped
 * to the parser/VM/engine/errors/config/lexer layers, not yet the ~17
 * domain packages — see that file's module doc for the intended per-package
 * pattern this follows).
 */
export const WeatherErrorCodes = {
	/** Open-Meteo's geocoding endpoint returned a non-OK HTTP status. */
	GEOCODING_API_ERROR: "WEATHER_GEOCODING_API_ERROR",
	/** Geocoding succeeded (200 OK) but matched no place for the given name — most likely a typo in the city, not an API failure. */
	CITY_NOT_FOUND: "WEATHER_CITY_NOT_FOUND",
	/** Open-Meteo's forecast endpoint returned a non-OK HTTP status. */
	FORECAST_API_ERROR: "WEATHER_FORECAST_API_ERROR",
	/** Forecast endpoint returned 200 OK but the response body is missing the expected current/daily blocks — an API contract violation, not a local bug. */
	FORECAST_RESPONSE_MALFORMED: "WEATHER_FORECAST_RESPONSE_MALFORMED",
	/** WeatherPackage.ts's fetchQuery switch fell through to its default case — unreachable via this package's own parselets, an internal invariant violation if it ever happens. */
	UNKNOWN_QUERY_KIND: "WEATHER_UNKNOWN_QUERY_KIND",
} as const;

/**
 * Open-Meteo (https://open-meteo.com) — chosen because it's genuinely free
 * and keyless (no signup, no API key, no rate-limit tier to configure) for
 * both geocoding and forecast data, unlike every stock-quote / knowledge-
 * answer API surveyed for the sibling `stocks`/`knowledge` packages. This
 * is why Weather can be a default `BUILTIN_PACKAGES` member while those two
 * are opt-in-only — see `WeatherPackage.ts`'s module doc.
 */
const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";

/** Hard timeout for each Open-Meteo HTTP call (geocoding or forecast). */
const FETCH_TIMEOUT_MS = 10_000;

export interface CityWeather {
	/** The resolved place name Open-Meteo matched, e.g. "London" for input "london". */
	resolvedName: string;
	/** WMO weather code — see WmoWeatherCodes.ts. */
	weatherCode: number;
	/** Human-readable description derived from weatherCode, e.g. "overcast". */
	description: string;
	/** Current temperature, Celsius. */
	temperature: number;
	/** "Feels like" temperature, Celsius. */
	apparentTemperature: number;
	/** Today's forecast high, Celsius. */
	high: number;
	/** Today's forecast low, Celsius. */
	low: number;
}

interface GeocodingResult {
	latitude: number;
	longitude: number;
	name: string;
}

async function geocodeCity(city: string, signal: AbortSignal): Promise<GeocodingResult> {
	const url = `${GEOCODING_API_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw ErrorFactory.external(
			WeatherErrorCodes.GEOCODING_API_ERROR,
			`Open-Meteo geocoding API returned ${response.status} for "${city}"`,
			{ city, status: response.status },
		);
	}
	const json = await response.json();
	const first = json?.results?.[0];
	if (!first) {
		throw ErrorFactory.validation(
			WeatherErrorCodes.CITY_NOT_FOUND,
			`No location found for "${city}"`,
			{ city },
		);
	}
	return { latitude: first.latitude, longitude: first.longitude, name: first.name };
}

async function fetchForecast(lat: number, lon: number, signal: AbortSignal): Promise<{
	weatherCode: number;
	temperature: number;
	apparentTemperature: number;
	high: number;
	low: number;
}> {
	const params = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		current: "temperature_2m,apparent_temperature,weather_code",
		daily: "temperature_2m_max,temperature_2m_min",
		timezone: "auto",
		forecast_days: "1",
	});
	const response = await fetch(`${FORECAST_API_URL}?${params.toString()}`, { signal });
	if (!response.ok) {
		throw ErrorFactory.external(
			WeatherErrorCodes.FORECAST_API_ERROR,
			`Open-Meteo forecast API returned ${response.status}`,
			{ status: response.status },
		);
	}
	const json = await response.json();
	const current = json?.current;
	const daily = json?.daily;
	if (!current || !daily) {
		throw ErrorFactory.external(
			WeatherErrorCodes.FORECAST_RESPONSE_MALFORMED,
			"Open-Meteo forecast response missing current/daily blocks",
		);
	}
	return {
		weatherCode: current.weather_code,
		temperature: current.temperature_2m,
		apparentTemperature: current.apparent_temperature,
		high: daily.temperature_2m_max?.[0],
		low: daily.temperature_2m_min?.[0],
	};
}

/**
 * In-flight + short-TTL result cache, keyed by lowercased city name.
 *
 * `createQueryResolver` (see `WeatherPackage.ts`) caches per EXACT query
 * string, and this package's query strings are `"<kind>:<city>"` (kind is
 * one of current/temperature/feelslike/high/low) — so "weather in london"
 * and "temperature in london" are DIFFERENT cache entries under TanStack
 * Query, even though both need the exact same underlying Open-Meteo
 * response. Without this module-level cache, a note with several weather
 * queries for the same city would trigger one real HTTP round-trip
 * (geocode + forecast) PER kind, PER city — five real fetches for what is
 * conceptually one answer.
 *
 * This cache is intentionally short-lived (60s) — it exists purely to
 * coalesce near-simultaneous multi-kind lookups for the same city, not to
 * replace `createQueryResolver`'s own `staleTimeMs` (which governs how
 * long a RESOLVED value is considered fresh, tuned per WeatherPackage.ts's
 * "refreshes during the day" reasoning). After 60s this entry expires and
 * the next lookup (of any kind) re-fetches from Open-Meteo, but by then
 * TanStack Query's own per-kind cache is usually still serving the
 * previously resolved Value anyway.
 */
const cityWeatherCache = new Map<string, { promise: Promise<CityWeather>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Resolve a city name to current conditions + today's forecast high/low via
 * Open-Meteo's geocoding + forecast APIs (two sequential HTTP calls). See
 * the module doc for why results are also coalesced in `cityWeatherCache`.
 */
export function fetchCityWeather(city: string, signal: AbortSignal): Promise<CityWeather> {
	const key = city.trim().toLowerCase();
	const now = Date.now();
	const cached = cityWeatherCache.get(key);
	if (cached && cached.expiresAt > now) {
		return cached.promise;
	}

	const { signal: fetchSignal, cleanup } = createTimeoutSignal(signal, FETCH_TIMEOUT_MS, "Open-Meteo weather query");

	const promise = (async () => {
		try {
			const geo = await geocodeCity(city, fetchSignal);
			const forecast = await fetchForecast(geo.latitude, geo.longitude, fetchSignal);
			return {
				resolvedName: geo.name,
				weatherCode: forecast.weatherCode,
				description: describeWeatherCode(forecast.weatherCode),
				temperature: forecast.temperature,
				apparentTemperature: forecast.apparentTemperature,
				high: forecast.high,
				low: forecast.low,
			};
		} finally {
			cleanup();
		}
	})();

	cityWeatherCache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
	// A failed lookup shouldn't poison the cache for the full TTL — evict
	// immediately on rejection so the next query (of any kind) gets a
	// fresh attempt instead of replaying the same failure for 60s.
	promise.catch(() => {
		const entry = cityWeatherCache.get(key);
		if (entry?.promise === promise) {
			cityWeatherCache.delete(key);
		}
	});

	return promise;
}
