/**
 * The Provider Management descriptions say what each toggle turns off and
 * what stays (#94). Every example a description names is evaluated here with
 * every toggle on and with that one toggle off, through the same mapper the
 * plugin builds its engines with, so a description cannot drift from what the
 * engine does.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "solve-engine/engine";
import { ValueType } from "solve-engine/vm";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import { PROVIDER_TOGGLES, type ProviderSettingKey } from "@app/settings/ProviderToggles";
import type UserSettings from "@app/settings/UserSettings";

const KEYS: ProviderSettingKey[] = PROVIDER_TOGGLES.map((t) => t.setting);

/** Settings with every toggle on but `off`, the retired big-integer one included. */
function settingsWith(off?: ProviderSettingKey | "bigIntegerArithmeticProvider"): UserSettings {
	const settings: Record<string, { enabled: boolean }> = { bigIntegerArithmeticProvider: { enabled: off !== "bigIntegerArithmeticProvider" } };
	for (const key of KEYS) settings[key] = { enabled: key !== off };
	return settings as unknown as UserSettings;
}

/** An engine with the packages the settings select, the network off. */
function engineFor(settings: UserSettings): ExpressionEngine {
	return new ExpressionEngine({ packages: EngineConfigMapper.toPackages(settings), config: { network: { enabled: false } } });
}

/** True when the line answers with a value: not thrown, not an error. */
function answers(engine: ExpressionEngine, line: string): boolean {
	try {
		return engine.evaluateExpression(line).type !== ValueType.Error;
	} catch {
		return false;
	}
}

describe("each toggle's description is what the engine does", () => {
	const everything = engineFor(settingsWith());

	test.each(PROVIDER_TOGGLES.map((t) => [t.name, t] as const))("%s", (_name, toggle) => {
		const without = engineFor(settingsWith(toggle.setting));
		for (const line of toggle.removes) {
			expect({ line, on: answers(everything, line) }).toEqual({ line, on: true });
			expect({ line, off: answers(without, line) }).toEqual({ line, off: false });
			expect(toggle.description).toContain(line);
		}
		for (const line of toggle.keeps) {
			expect({ line, on: answers(everything, line) }).toEqual({ line, on: true });
			expect({ line, off: answers(without, line) }).toEqual({ line, off: true });
			expect(toggle.description).toContain(line);
		}
	});

	test("every toggle names at least one thing it removes, and each turns off a different package", () => {
		for (const toggle of PROVIDER_TOGGLES) expect(toggle.removes.length).toBeGreaterThan(0);
		const removedSets = PROVIDER_TOGGLES.map((t) => EngineConfigMapper.toPackages(settingsWith(t.setting)).length);
		for (const length of removedSets) expect(length).toBe(EngineConfigMapper.toPackages(settingsWith()).length - 1);
	});

	test("the Datetime description's warning holds: a written date becomes arithmetic", () => {
		const without = engineFor(settingsWith("datetimeProvider"));
		const v = without.evaluateExpression("2026-01-01 + 3 days");
		expect(v.type).not.toBe(ValueType.Datetime);
		expect(everything.evaluateExpression("2026-01-01 + 3 days").type).toBe(ValueType.Datetime);
	});

	test("the retired big-integer toggle changes nothing: its forms are the engine's own", () => {
		const off = engineFor(settingsWith("bigIntegerArithmeticProvider"));
		for (const line of ["0b10101 >> 4", "123n", "0xff"]) {
			expect({ line, off: answers(off, line) }).toEqual({ line, off: true });
		}
		expect(EngineConfigMapper.toPackages(settingsWith("bigIntegerArithmeticProvider"))).toEqual(EngineConfigMapper.toPackages(settingsWith()));
	});
});

describe("adversarial", () => {
	test("every toggle off at once leaves an engine that still adds", () => {
		const settings = settingsWith();
		for (const key of KEYS) (settings as unknown as Record<string, { enabled: boolean }>)[key].enabled = false;
		const engine = engineFor(settings);
		expect(engine.evaluateExpression("10 + 2").toNumber()).toBe(12);
		for (const toggle of PROVIDER_TOGGLES) for (const line of toggle.removes) expect({ line, answers: answers(engine, line) }).toEqual({ line, answers: false });
	});

	test("a description is plain prose: no markup a settings pane would render or execute", () => {
		for (const toggle of PROVIDER_TOGGLES) {
			expect(toggle.description).not.toMatch(/[<>`]/);
			expect(toggle.description).not.toMatch(/—/);
			expect(toggle.description.length).toBeLessThan(400);
		}
	});
});
