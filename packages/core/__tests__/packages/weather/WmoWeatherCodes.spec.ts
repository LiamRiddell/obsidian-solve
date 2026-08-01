import { describe, expect, test } from "@jest/globals";
import { describeWeatherCode, WMO_WEATHER_DESCRIPTIONS } from "@solve-js/packages/weather/WmoWeatherCodes";

describe("WmoWeatherCodes", () => {
	test("maps documented codes to descriptions", () => {
		expect(describeWeatherCode(0)).toBe("clear sky");
		expect(describeWeatherCode(3)).toBe("overcast");
		expect(describeWeatherCode(61)).toBe("slight rain");
		expect(describeWeatherCode(95)).toBe("thunderstorm");
	});

	test("falls back to a generic label for an unrecognized code rather than throwing", () => {
		expect(describeWeatherCode(12345)).toBe("weather code 12345");
	});

	test("table covers the documented Open-Meteo code range without gaps in the common set", () => {
		for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99]) {
			expect(WMO_WEATHER_DESCRIPTIONS[code]).toBeDefined();
			expect(typeof WMO_WEATHER_DESCRIPTIONS[code]).toBe("string");
		}
	});
});
