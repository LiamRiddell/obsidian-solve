import { describe, expect, test } from "@jest/globals";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
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
