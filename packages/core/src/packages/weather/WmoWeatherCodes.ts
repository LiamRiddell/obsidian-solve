/**
 * WMO ("World Meteorological Organization") weather interpretation codes,
 * as returned by Open-Meteo's `weather_code` field
 * (https://open-meteo.com/en/docs — "WMO Weather interpretation codes").
 *
 * This is a standard, documented, provider-agnostic code scheme (Open-Meteo
 * didn't invent it, it just surfaces it) — the same codes appear in METAR/
 * SYNOP reporting more broadly. Not every possible WMO code has a distinct
 * Open-Meteo meaning; this table only covers the subset Open-Meteo actually
 * emits, confirmed against its docs rather than the full WMO 4677 table.
 */
export const WMO_WEATHER_DESCRIPTIONS: Record<number, string> = {
	0: "clear sky",
	1: "mainly clear",
	2: "partly cloudy",
	3: "overcast",
	45: "fog",
	48: "depositing rime fog",
	51: "light drizzle",
	53: "moderate drizzle",
	55: "dense drizzle",
	56: "light freezing drizzle",
	57: "dense freezing drizzle",
	61: "slight rain",
	63: "moderate rain",
	65: "heavy rain",
	66: "light freezing rain",
	67: "heavy freezing rain",
	71: "slight snow fall",
	73: "moderate snow fall",
	75: "heavy snow fall",
	77: "snow grains",
	80: "slight rain showers",
	81: "moderate rain showers",
	82: "violent rain showers",
	85: "slight snow showers",
	86: "heavy snow showers",
	95: "thunderstorm",
	96: "thunderstorm with slight hail",
	99: "thunderstorm with heavy hail",
};

/**
 * Map a WMO weather code to a short human-readable description.
 * Falls back to a generic label (rather than throwing) for any code
 * Open-Meteo might add in the future that isn't in the table yet —
 * an unrecognized code shouldn't break the whole weather query.
 */
export function describeWeatherCode(code: number): string {
	return WMO_WEATHER_DESCRIPTIONS[code] ?? `weather code ${code}`;
}
