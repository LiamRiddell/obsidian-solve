/**
 * EngineConfigMapper — Unit Tests
 *
 * Tests the Obsidian settings → engine config mapping layer:
 * - Validation limits (maxExpressionLength, maxComplexity, maxNestingDepth)
 * - VM limits (maxStackDepth, maxInstructions)
 * - Backward compatibility with old saved settings (missing sections)
 * - Zero and large value handling
 * - Isolation: only validation + vm sections are mapped
 */

import { describe, expect, test } from "@jest/globals";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import type UserSettings from "@app/settings/UserSettings";

/**
 * Create a minimal mock of UserSettings with the engine properties
 * that EngineConfigMapper.toEngineConfig() reads.
 *
 * Only the `engine` section is populated — the mapper does not access
 * any other UserSettings properties (interface, inlineSolve, variable,
 * providers, result settings, etc.).
 *
 * @param overrides - Optional overrides for specific settings values.
 * @returns An object that satisfies the UserSettings type (at runtime).
 */
function createMockSettings(overrides?: {
  maxExpressionLength?: number;
  maxComplexity?: number;
  maxNestingDepth?: number;
  maxStackDepth?: number;
  maxInstructions?: number;
}): UserSettings {
  return {
    engine: {
      maxExpressionLength: overrides?.maxExpressionLength ?? 2000,
      maxComplexity: overrides?.maxComplexity ?? 500,
      maxNestingDepth: overrides?.maxNestingDepth ?? 50,
      maxStackDepth: overrides?.maxStackDepth ?? 200,
      maxInstructions: overrides?.maxInstructions ?? 50000,
    },
  } as unknown as UserSettings;
}

/**
 * Create a mock of UserSettings that simulates **old saved settings** —
 * where `engine.validation` and/or `engine.vm` are completely absent
 * from the raw data object (as would happen when loading settings that
 * predate Phase 1.7's addition of `validation` and `vm`).
 *
 * This simulates the behavior of the real EngineSettings proxy class,
 * which uses `?.` optional chaining to detect missing nested sections
 * and falls back to `DEFAULT_SETTINGS` for each property:
 *
 * ```ts
 * get maxExpressionLength() {
 *   return this.parent.settings.engine.validation?.maxExpressionLength
 *       ?? DEFAULT_SETTINGS.engine.validation.maxExpressionLength;
 * }
 * ```
 *
 * Even though the EngineConfigMapper only accesses the proxied getters
 * (settings.engine.maxExpressionLength and friends), this test confirms
 * that the mapper correctly receives default values when the underlying
 * sections are absent.
 *
 * @param sections - Which sections to include. Omitted sections simulate
 *   missing data from old saved settings.
 * @param values - Optional override values within included sections.
 */
function createBackwardCompatMockSettings(sections: {
  validation?: boolean;
  vm?: boolean;
}, values?: {
  validation?: { maxExpressionLength?: number; maxComplexity?: number; maxNestingDepth?: number };
  vm?: { maxStackDepth?: number; maxInstructions?: number };
}): UserSettings {
  // If a section is present, use the provided values (or nothing, so the
  // getter tries raw access → undefined → falls back to DEFAULT_SETTINGS).
  // If a section is absent, the getter also hits undefined → DEFAULT_SETTINGS.
  const engineData: {
    validation?: typeof DEFAULT_SETTINGS.engine.validation;
    vm?: typeof DEFAULT_SETTINGS.engine.vm;
  } = {};

  if (sections.validation && values?.validation) {
    engineData.validation = {
      maxExpressionLength: values.validation.maxExpressionLength ?? DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
      maxComplexity: values.validation.maxComplexity ?? DEFAULT_SETTINGS.engine.validation.maxComplexity,
      maxNestingDepth: values.validation.maxNestingDepth ?? DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
    };
  }
  // If sections.validation is true but no values given, validation stays
  // undefined — getter falls back to DEFAULT_SETTINGS.

  if (sections.vm && values?.vm) {
    engineData.vm = {
      maxStackDepth: values.vm.maxStackDepth ?? DEFAULT_SETTINGS.engine.vm.maxStackDepth,
      maxInstructions: values.vm.maxInstructions ?? DEFAULT_SETTINGS.engine.vm.maxInstructions,
    };
  }

  // Simulate EngineSettings proxy getters with backward-compatible fallback
  return {
    engine: {
      get maxExpressionLength() {
        return engineData.validation?.maxExpressionLength ?? DEFAULT_SETTINGS.engine.validation.maxExpressionLength;
      },
      get maxComplexity() {
        return engineData.validation?.maxComplexity ?? DEFAULT_SETTINGS.engine.validation.maxComplexity;
      },
      get maxNestingDepth() {
        return engineData.validation?.maxNestingDepth ?? DEFAULT_SETTINGS.engine.validation.maxNestingDepth;
      },
      get maxStackDepth() {
        return engineData.vm?.maxStackDepth ?? DEFAULT_SETTINGS.engine.vm.maxStackDepth;
      },
      get maxInstructions() {
        return engineData.vm?.maxInstructions ?? DEFAULT_SETTINGS.engine.vm.maxInstructions;
      },
    },
  } as unknown as UserSettings;
}

describe("EngineConfigMapper", () => {
  describe("toEngineConfig()", () => {
    // ── Defaults ──────────────────────────────────────────────────────

    test("maps default validation settings correctly", () => {
      const settings = createMockSettings();
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 2000,
        maxComplexity: 500,
        maxNestingDepth: 50,
      });
    });

    test("maps default vm settings correctly", () => {
      const settings = createMockSettings();
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.vm).toEqual({
        maxStackDepth: 200,
        maxInstructions: 50000,
      });
    });

    // ── Custom values ─────────────────────────────────────────────────

    test("maps custom validation values correctly", () => {
      const settings = createMockSettings({
        maxExpressionLength: 100,
        maxComplexity: 50,
        maxNestingDepth: 10,
      });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 100,
        maxComplexity: 50,
        maxNestingDepth: 10,
      });
    });

    test("maps custom vm values correctly", () => {
      const settings = createMockSettings({
        maxStackDepth: 500,
        maxInstructions: 100000,
      });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.vm).toEqual({
        maxStackDepth: 500,
        maxInstructions: 100000,
      });
    });

    test("maps mixed custom validation and vm values correctly", () => {
      const settings = createMockSettings({
        maxExpressionLength: 500,
        maxComplexity: 100,
        maxNestingDepth: 20,
        maxStackDepth: 100,
        maxInstructions: 25000,
      });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 500,
        maxComplexity: 100,
        maxNestingDepth: 20,
      });
      expect(config.vm).toEqual({
        maxStackDepth: 100,
        maxInstructions: 25000,
      });
    });

    // ── Isolation ─────────────────────────────────────────────────────

    test("does not include non-mapped engine config sections (date, dice, etc.)", () => {
      const settings = createMockSettings();
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config).not.toHaveProperty("date");
      expect(config).not.toHaveProperty("dice");
      expect(config).not.toHaveProperty("performance");
      expect(config).not.toHaveProperty("worker");
      expect(config).not.toHaveProperty("diagnostic");
    });

    test("validation defaults preserved when only vm overrides are provided", () => {
      const settings = createMockSettings({ maxStackDepth: 50 });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 2000,
        maxComplexity: 500,
        maxNestingDepth: 50,
      });
      expect(config.vm).toEqual({
        maxStackDepth: 50,
        maxInstructions: 50000,
      });
    });

    test("vm defaults preserved when only validation overrides are provided", () => {
      const settings = createMockSettings({ maxExpressionLength: 100 });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 100,
        maxComplexity: 500,
        maxNestingDepth: 50,
      });
      expect(config.vm).toEqual({
        maxStackDepth: 200,
        maxInstructions: 50000,
      });
    });

    // ── Return shape ──────────────────────────────────────────────────

    test("returns only the two mapped sections (validation, vm)", () => {
      const settings = createMockSettings();
      const config = EngineConfigMapper.toEngineConfig(settings);

      const keys = Object.keys(config);
      expect(keys).toEqual(["validation", "vm"]);
    });

    test("return value is a Partial<EngineConfig> — not the full EngineConfig", () => {
      const settings = createMockSettings();
      const config = EngineConfigMapper.toEngineConfig(settings);

      // Both sections should be present
      expect(config.validation).toBeDefined();
      expect(config.vm).toBeDefined();

      // All 5 fields should be numbers
      expect(typeof config.validation!.maxExpressionLength).toBe("number");
      expect(typeof config.validation!.maxComplexity).toBe("number");
      expect(typeof config.validation!.maxNestingDepth).toBe("number");
      expect(typeof config.vm!.maxStackDepth).toBe("number");
      expect(typeof config.vm!.maxInstructions).toBe("number");
    });

    // ── Backward compatibility (old saved settings) ────────────────────

    test("returns default validation values when validation section is absent (old settings)", () => {
      const settings = createBackwardCompatMockSettings({});
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
        maxComplexity: DEFAULT_SETTINGS.engine.validation.maxComplexity,
        maxNestingDepth: DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
      });
    });

    test("returns default vm values when vm section is absent (old settings)", () => {
      const settings = createBackwardCompatMockSettings({});
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.vm).toEqual({
        maxStackDepth: DEFAULT_SETTINGS.engine.vm.maxStackDepth,
        maxInstructions: DEFAULT_SETTINGS.engine.vm.maxInstructions,
      });
    });

    test("returns default validation values when validation exists but is incomplete", () => {
      const settings = createBackwardCompatMockSettings(
        { validation: true },          // section present but no values → empty object
        {}                             // no values provided
      );
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
        maxComplexity: DEFAULT_SETTINGS.engine.validation.maxComplexity,
        maxNestingDepth: DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
      });
    });

    test("returns a mix: vm defaults from old settings, validation from new settings", () => {
      const settings = createBackwardCompatMockSettings(
        { validation: true, vm: false },  // vm section absent (old saved settings)
        {
          validation: { maxExpressionLength: 999 },
        }
      );
      const config = EngineConfigMapper.toEngineConfig(settings);

      // Validation should use the provided override
      expect(config.validation!.maxExpressionLength).toBe(999);
      expect(config.validation!.maxComplexity).toBe(DEFAULT_SETTINGS.engine.validation.maxComplexity);
      expect(config.validation!.maxNestingDepth).toBe(DEFAULT_SETTINGS.engine.validation.maxNestingDepth);

      // VM should use defaults since section was absent
      expect(config.vm).toEqual({
        maxStackDepth: DEFAULT_SETTINGS.engine.vm.maxStackDepth,
        maxInstructions: DEFAULT_SETTINGS.engine.vm.maxInstructions,
      });
    });

    test("returns a mix: validation defaults from old settings, vm from new settings", () => {
      const settings = createBackwardCompatMockSettings(
        { validation: false, vm: true },  // validation section absent
        {
          vm: { maxStackDepth: 777 },
        }
      );
      const config = EngineConfigMapper.toEngineConfig(settings);

      // Validation should use defaults since section was absent
      expect(config.validation).toEqual({
        maxExpressionLength: DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
        maxComplexity: DEFAULT_SETTINGS.engine.validation.maxComplexity,
        maxNestingDepth: DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
      });

      // VM should use the provided override
      expect(config.vm!.maxStackDepth).toBe(777);
      expect(config.vm!.maxInstructions).toBe(DEFAULT_SETTINGS.engine.vm.maxInstructions);
    });

    test("both sections absent — both return defaults", () => {
      const settings = createBackwardCompatMockSettings({});
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: DEFAULT_SETTINGS.engine.validation.maxExpressionLength,
        maxComplexity: DEFAULT_SETTINGS.engine.validation.maxComplexity,
        maxNestingDepth: DEFAULT_SETTINGS.engine.validation.maxNestingDepth,
      });
      expect(config.vm).toEqual({
        maxStackDepth: DEFAULT_SETTINGS.engine.vm.maxStackDepth,
        maxInstructions: DEFAULT_SETTINGS.engine.vm.maxInstructions,
      });
    });

    test("mixed old+new settings match the actual DEFAULT_SETTINGS values", () => {
      // Verify that the defaults returned by backward-compat path
      // are exactly what's in DEFAULT_SETTINGS
      const oldSettings = createBackwardCompatMockSettings({});
      const newSettings = createMockSettings();

      const oldConfig = EngineConfigMapper.toEngineConfig(oldSettings);
      const newConfig = EngineConfigMapper.toEngineConfig(newSettings);

      expect(oldConfig).toEqual(newConfig);
    });

    // ── Edge: extreme values ──────────────────────────────────────────

    test("handles zero values correctly", () => {
      const settings = createMockSettings({
        maxExpressionLength: 0,
        maxComplexity: 0,
        maxNestingDepth: 0,
        maxStackDepth: 0,
        maxInstructions: 0,
      });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 0,
        maxComplexity: 0,
        maxNestingDepth: 0,
      });
      expect(config.vm).toEqual({
        maxStackDepth: 0,
        maxInstructions: 0,
      });
    });

    test("handles large values correctly", () => {
      const settings = createMockSettings({
        maxExpressionLength: 100000,
        maxComplexity: 50000,
        maxNestingDepth: 5000,
        maxStackDepth: 10000,
        maxInstructions: 9999999,
      });
      const config = EngineConfigMapper.toEngineConfig(settings);

      expect(config.validation).toEqual({
        maxExpressionLength: 100000,
        maxComplexity: 50000,
        maxNestingDepth: 5000,
      });
      expect(config.vm).toEqual({
        maxStackDepth: 10000,
        maxInstructions: 9999999,
      });
    });
  });
});
