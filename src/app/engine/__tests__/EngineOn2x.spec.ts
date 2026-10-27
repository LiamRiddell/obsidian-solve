/**
 * The plugin on solve-engine 2.x (#91).
 *
 * 2.x takes one options object, `new ExpressionEngine({ locale, config,
 * packages })`. The positional constructor the plugin used read the locale
 * string as that object, so the locale fell back to `en`, and an engine built
 * without `packages` has none at all: `5 km in miles` stopped parsing. An
 * expression now answers one `Value`, not an array of them.
 *
 * These build engines exactly as `EngineProvider` and the editor pane do, from
 * the plugin's own settings through `EngineConfigMapper`.
 */

import { describe, expect, test } from "@jest/globals";
import type { ExpressionEngine } from "solve-engine/engine";
import { DEFAULT_CONFIG } from "solve-engine/constants";
import { ValueType } from "solve-engine/vm";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import { createPluginEngine } from "@app/engine/createPluginEngine";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import type UserSettings from "@app/settings/UserSettings";

/** The settings the mapper reads, with every provider on unless named. */
function settingsWith(options: { locale?: string; off?: string[]; vm?: { maxStackDepth?: number; maxInstructions?: number } } = {}): UserSettings {
	const off = new Set(options.off ?? []);
	const provider = (name: string) => ({ enabled: !off.has(name) });
	return {
		settings: { engine: { locale: options.locale ?? "en" } },
		engine: {
			maxExpressionLength: DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
			maxComplexity: DEFAULT_SETTINGS.engine.validation.maxComplexity,
			maxNestingDepth: DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
			maxStackDepth: options.vm?.maxStackDepth ?? DEFAULT_SETTINGS.engine.vm.maxStackDepth,
			maxInstructions: options.vm?.maxInstructions ?? DEFAULT_SETTINGS.engine.vm.maxInstructions,
		},
		arithmeticProvider: provider("arithmetic"),
		functionArithmeticProvider: provider("function"),
		vectorArithmeticProvider: provider("vector"),
		percentageArithmeticProvider: provider("percentage"),
		datetimeProvider: provider("datetime"),
		unitOfMeasurementProvider: provider("uom"),
		diceProvider: provider("dice"),
		bigIntegerArithmeticProvider: provider("bigint"),
	} as unknown as UserSettings;
}

/** An engine built as the plugin builds one. */
const pluginEngine = (settings: UserSettings): ExpressionEngine => createPluginEngine(settings);

describe("an engine built the plugin's way", () => {
	test("keeps its packages: units convert", () => {
		const v = pluginEngine(settingsWith()).evaluateExpression("5 km in miles");
		expect(v.type).toBe(ValueType.Uom);
		expect(v.unit).toBe("miles");
		expect(v.toNumber()).toBeCloseTo(3.106856, 5);
	});

	test("keeps its locale: German phrasing reads under de", () => {
		const engine = pluginEngine(settingsWith({ locale: "de" }));
		expect(engine.evaluateExpression("10 % von 200").toNumber()).toBe(20);
		expect(engine.evaluateExpression("5 km in miles").toNumber()).toBeCloseTo(3.106856, 5);
	});

	test("answers one Value, not an array, from both entry points", () => {
		const engine = pluginEngine(settingsWith());
		const fromExpression = engine.evaluateExpression("1 + 2");
		const fromLine = engine.evaluateLine(1, "1 + 2");
		expect(Array.isArray(fromExpression)).toBe(false);
		expect(Array.isArray(fromLine)).toBe(false);
		expect(fromExpression.toNumber()).toBe(3);
		expect(fromLine.toNumber()).toBe(3);
	});

	test("a provider switched off takes its package away", () => {
		const engine = pluginEngine(settingsWith({ off: ["uom"] }));
		expect(() => engine.evaluateExpression("5 km in miles")).toThrow();
		expect(engine.evaluateExpression("1 + 2").toNumber()).toBe(3);
	});

	test("the limits the plugin has no control for keep the engine's own defaults", () => {
		const engine = pluginEngine(settingsWith({ vm: { maxStackDepth: 123, maxInstructions: 45678 } }));
		const vm = engine.getConfig().vm;
		expect(vm.maxStackDepth).toBe(123);
		expect(vm.maxInstructions).toBe(45678);
		expect(vm.maxCollectionSize).toBe(DEFAULT_CONFIG.vm.maxCollectionSize);
		expect(vm.maxAllocatedElements).toBe(DEFAULT_CONFIG.vm.maxAllocatedElements);
		expect(vm.maxFunctionCalls).toBe(DEFAULT_CONFIG.vm.maxFunctionCalls);
		expect(vm.maxGoalSeekIterations).toBe(DEFAULT_CONFIG.vm.maxGoalSeekIterations);
	});

	test("the override names only the fields the plugin sets", () => {
		const override = EngineConfigMapper.toEngineConfig(settingsWith());
		expect(Object.keys(override).sort()).toEqual(["date", "network", "validation", "vm"]);
		expect(Object.keys(override.date ?? {})).toEqual(["inputOrder"]);
		expect(Object.keys(override.network ?? {})).toEqual(["enabled"]);
		expect(Object.keys(override.vm ?? {}).sort()).toEqual(["maxInstructions", "maxStackDepth"]);
	});
});

describe("adversarial", () => {
	test("security: a locale named like an Object.prototype property falls back to English and leaves the prototype alone", () => {
		// solve-engine 2.40.0 throws building an engine with these; the plugin
		// falls back to en rather than leaving a pane without one.
		const before = Object.getOwnPropertyNames(Object.prototype).sort();
		for (const locale of ["constructor", "__proto__", "toString", "hasOwnProperty", ""]) {
			const engine = pluginEngine(settingsWith({ locale }));
			expect(engine.evaluateExpression("2 * 21").toNumber()).toBe(42);
		}
		expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
	});

	test("realistic: every provider off still leaves the core reading arithmetic", () => {
		const engine = pluginEngine(settingsWith({ off: ["arithmetic", "function", "vector", "percentage", "datetime", "uom", "dice", "bigint"] }));
		expect(engine.evaluateExpression("2 + 3 * 4").toNumber()).toBe(14);
	});

	test("realistic: a prose line is refused, never answered with a number", () => {
		const engine = pluginEngine(settingsWith());
		let outcome: string;
		try {
			const v = engine.evaluateExpression("Groceries for the week");
			outcome = v.type === ValueType.Error ? "error value" : `answered ${v.toString()}`;
		} catch {
			outcome = "thrown";
		}
		expect(outcome).not.toMatch(/^answered/);
	});

	test("edge: a zero instruction limit from old settings refuses rather than hangs", () => {
		const engine = pluginEngine(settingsWith({ vm: { maxInstructions: 0 } }));
		expect(() => engine.evaluateExpression("1 + 1")).toThrow();
	});
});
