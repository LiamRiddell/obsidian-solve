/**
 * The date order, the date format, live data and warm-up settings (#95), and
 * the removal of the dead "Show variable result" setting.
 *
 * Numeric dates are the sharpest case. solve-engine reads a slash date day
 * first unless told otherwise, and refuses a US date it cannot read that way
 * with a named reason, which a US reader saw as a blank line. These build real
 * engines from the plugin's settings through the same mappers and the same
 * builder the editor uses, so the setting is proven by what the engine answers.
 */

import { describe, expect, test } from "@jest/globals";
import { formatValue } from "solve-engine/format";
import { ValueType } from "solve-engine/vm";
import { createPluginEngine, engineSettingsKey } from "@app/engine/createPluginEngine";
import { FormattingSettingsMapper } from "@app/engine/FormattingSettingsMapper";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import { DATE_INPUT_ORDERS } from "@app/settings/definition/IEngineSettings";
import { DATE_OUTPUT_FORMATS } from "@app/settings/definition/IDateResultSettings";
import { deepMerge } from "@app/utilities/DeepMerge";
import UserSettings from "@app/settings/UserSettings";

/** A real UserSettings over saved data merged onto the defaults, as the plugin loads it. */
function settingsFrom(saved: Record<string, unknown> = {}): UserSettings {
	const user = UserSettings.getInstance();
	user.updateSettings(deepMerge(DEFAULT_SETTINGS, saved));
	return user;
}

/** What a line answers on an engine built from these settings, shown as the plugin shows it. */
function answer(settings: UserSettings, line: string): string {
	const engine = createPluginEngine(settings);
	try {
		const value = engine.evaluateExpression(line);
		return value.type === ValueType.Error ? `ERROR ${value.errorCode}` : formatValue(value, FormattingSettingsMapper.toFormattingSettings(settings));
	} finally {
		engine.clear();
	}
}

describe("date input order", () => {
	test("the defaults are the reader's machine's order, live data on and warm-up on", () => {
		expect(DEFAULT_SETTINGS.engine.dateInputOrder).toBe("locale");
		expect(DEFAULT_SETTINGS.engine.networkEnabled).toBe(true);
		expect(DEFAULT_SETTINGS.engine.warmup).toBe(true);
		expect(DEFAULT_SETTINGS.dateResult.format).toBe("long");
	});

	test("month first reads a US date, and day first refuses it with a named reason", () => {
		expect(answer(settingsFrom({ engine: { dateInputOrder: "MDY" } }), "12/25/2026")).toBe("= Friday, December 25, 2026");
		expect(answer(settingsFrom({ engine: { dateInputOrder: "DMY" } }), "12/25/2026")).toBe("ERROR DATE_ORDER_MISMATCH");
		expect(answer(settingsFrom({ engine: { dateInputOrder: "auto" } }), "12/25/2026")).toBe("ERROR DATE_ORDER_MISMATCH");
	});

	test("the same ambiguous date is read each way the setting says", () => {
		expect(answer(settingsFrom({ engine: { dateInputOrder: "MDY" } }), "03/04/2026")).toBe("= Wednesday, March 4, 2026");
		expect(answer(settingsFrom({ engine: { dateInputOrder: "DMY" } }), "03/04/2026")).toBe("= Friday, April 3, 2026");
		expect(answer(settingsFrom({ engine: { dateInputOrder: "YMD" } }), "2026/03/04")).toBe("= Wednesday, March 4, 2026");
	});

	test("every order the engine knows is one the plugin offers", () => {
		expect([...DATE_INPUT_ORDERS].sort()).toEqual(["DMY", "MDY", "YMD", "auto", "locale"]);
		for (const order of DATE_INPUT_ORDERS) expect(answer(settingsFrom({ engine: { dateInputOrder: order } }), "2 + 2")).toBe("= 4");
	});

	test("adversarial: a saved value that is not an order falls back to the default instead of reaching the engine", () => {
		for (const bad of ["mdy", "", "DMY ", "__proto__", "constructor", 5, null, ["MDY"], { order: "MDY" }]) {
			const settings = settingsFrom({ engine: { dateInputOrder: bad } });
			expect(settings.engine.dateInputOrder).toBe(DEFAULT_SETTINGS.engine.dateInputOrder);
			expect(answer(settings, "2 + 2")).toBe("= 4");
		}
	});
});

describe("date output format", () => {
	test("each format writes the same date as the setting says", () => {
		const expected = { long: "= Friday, December 25, 2026", iso: "= 2026-12-25", dmy: "= 25/12/2026", mdy: "= 12/25/2026" };
		for (const format of DATE_OUTPUT_FORMATS) expect(answer(settingsFrom({ dateResult: { format } }), "2026-12-25")).toBe(expected[format]);
	});

	test("adversarial: a saved value that is not a format writes the long form", () => {
		for (const bad of ["ISO", "", "long ", "__proto__", 0, null, ["iso"]]) {
			const settings = settingsFrom({ dateResult: { format: bad } });
			expect(settings.dateResult.format).toBe("long");
			expect(answer(settings, "2026-12-25")).toBe("= Friday, December 25, 2026");
		}
	});

	test("old saved data with no date section is backfilled with the long form", () => {
		const settings = settingsFrom({});
		expect(settings.dateResult.format).toBe("long");
		expect(FormattingSettingsMapper.toFormattingSettings(settings).dateResult?.format).toBe("long");
	});
});

describe("live data", () => {
	test("on by default, a currency conversion is not refused for being offline; off, it is refused by name", () => {
		expect(answer(settingsFrom({ engine: { networkEnabled: false } }), "10 USD in EUR")).toBe("ERROR NETWORK_DISABLED");
		expect(answer(settingsFrom({ engine: { networkEnabled: false } }), "2 + 2")).toBe("= 4");
	});
});

describe("a change reaches the open panes", () => {
	test("the order, live data and warm-up each change the settings an engine is built from", () => {
		const base = engineSettingsKey(settingsFrom({}));
		expect(engineSettingsKey(settingsFrom({ engine: { dateInputOrder: "MDY" } }))).not.toBe(base);
		expect(engineSettingsKey(settingsFrom({ engine: { networkEnabled: false } }))).not.toBe(base);
		expect(engineSettingsKey(settingsFrom({ engine: { warmup: false } }))).not.toBe(base);
	});

	test("the date format is a display setting: it does not rebuild the engine", () => {
		expect(engineSettingsKey(settingsFrom({ dateResult: { format: "iso" } }))).toBe(engineSettingsKey(settingsFrom({})));
	});

	test("an engine builds with warm-up on and off, and answers the same", () => {
		expect(answer(settingsFrom({ engine: { warmup: true } }), "5 km in miles")).toBe(answer(settingsFrom({ engine: { warmup: false } }), "5 km in miles"));
	});
});

describe("the dead setting is gone", () => {
	test("there is no variable section in the defaults or on the settings object", () => {
		expect(DEFAULT_SETTINGS).not.toHaveProperty("variable");
		expect(settingsFrom({})).not.toHaveProperty("variable");
	});

	test("old saved data that still holds it loads without complaint", () => {
		const settings = settingsFrom({ variable: { renderResult: false } });
		expect(answer(settings, "2 + 2")).toBe("= 4");
	});
});
