import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { EngineConfigMapper } from "@app/engine/EngineConfigMapper";
import type UserSettings from "@app/settings/UserSettings";

/**
 * Create a minimal mock UserSettings for integration testing.
 *
 * The mock supplies the engine properties that EngineConfigMapper reads
 * (maxExpressionLength, maxComplexity, maxNestingDepth, maxStackDepth,
 * maxInstructions). These are the same properties the real EngineSettings
 * proxy exposes at the `engine` level.
 */
function createMockSettings(vmOverrides?: {
  maxStackDepth?: number;
  maxInstructions?: number;
}): UserSettings {
  return {
    engine: {
      maxExpressionLength: 2000,
      maxComplexity: 500,
      maxNestingDepth: 50,
      maxStackDepth: vmOverrides?.maxStackDepth ?? 200,
      maxInstructions: vmOverrides?.maxInstructions ?? 50000,
    },
  } as unknown as UserSettings;
}

describe("EngineConfigMapper → ExpressionEngine integration", () => {
  // ── Baseline: normal expression with defaults ─────────────────────────

  test("default VM limits via mapper allow normal expressions", () => {
    const settings = createMockSettings();
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // A simple expression should evaluate correctly
    expect(engine.evaluateLine(1, "10 + 20").toNumber()).toBe(30);

    // A longer expression with many operations should also work
    expect(engine.evaluateLine(1, "1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10").toNumber()).toBe(55);
  });

  // ── Low maxInstructions enforcement ───────────────────────────────────

  test("low maxInstructions via mapper throws on long expressions", () => {
    // Set a very low instruction limit — only 5 opcode dispatches allowed
    const settings = createMockSettings({ maxInstructions: 5 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // "1+2+3+4+5" generates ~9 opcode dispatches (5x PUSH_NUMBER + 4x ADD)
    // which exceeds the 5-instruction limit
    expect(() => engine.evaluateLine(1, "1 + 2 + 3 + 4 + 5")).toThrow(
      /maximum of 5 instructions/i
    );
  });

  test("low maxInstructions via mapper also caught by evaluateNumber", () => {
    const settings = createMockSettings({ maxInstructions: 5 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // evaluateNumber catches errors and returns NaN
    expect(engine.evaluateNumber("1 + 2 + 3 + 4 + 5")).toBeNaN();
  });

  test("low maxInstructions via mapper caught by evaluateLines", () => {
    const settings = createMockSettings({ maxInstructions: 5 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // evaluateLines should report the instruction limit error per-line
    const results = engine.evaluateLines(["42", "1 + 2 + 3 + 4 + 5", "99"]);
    expect(results[0].result?.toNumber()).toBe(42);
    expect(results[1].error).toMatch(/maximum.*instructions/i);
    expect(results[2].result?.toNumber()).toBe(99);
  });

  // ── Low maxStackDepth ────────────────────────────────────────────────
  //
  // NOTE: In the hot-path executeBytecode(), the VM uses a direct stack
  // reference (vm.getStack()) and Array.push/pop directly, bypassing the
  // VM.push() bounds check for performance. The bytecode compiler
  // guarantees stack balance, so the maxStackDepth limit does not restrict
  // the hot loop (see comment in VM.ts). The following tests verify that
  // the mapped value is present in engine.getConfig() — its enforcement
  // applies only to external VM.push() calls, not to bytecode execution.

  test("low maxStackDepth is present in engine config even if bytecode execution bypasses it", () => {
    const settings = createMockSettings({ maxStackDepth: 1, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // The mapped maxStackDepth=1 is present in config
    expect(engine.getConfig().vm.maxStackDepth).toBe(1);

    // The hot path bypasses the push() bounds check, so expressions
    // that need >1 stack slots still work correctly.
    expect(engine.evaluateLine(1, "2 + 3").toNumber()).toBe(5);
    expect(engine.evaluateLine(1, "max(1, 2, 3)").toNumber()).toBe(3);
  });

  test("generous maxStackDepth via mapper allows complex expressions", () => {
    const settings = createMockSettings({ maxStackDepth: 10, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    expect(engine.evaluateLine(1, "max(1, 2, 3)").toNumber()).toBe(3);
    expect(engine.getConfig().vm.maxStackDepth).toBe(10);
  });

  // ── Config introspection ─────────────────────────────────────────────

  test("engine.getConfig() reflects mapped VM values", () => {
    const customStack = 50;
    const customInstructions = 1000;
    const settings = createMockSettings({
      maxStackDepth: customStack,
      maxInstructions: customInstructions,
    });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    const engineConfig = engine.getConfig();
    expect(engineConfig.vm.maxStackDepth).toBe(customStack);
    expect(engineConfig.vm.maxInstructions).toBe(customInstructions);
  });

  test("default engine.getConfig() VM section matches DEFAULT_CONFIG", () => {
    const settings = createMockSettings();
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    const engineConfig = engine.getConfig();
    // Default values from DEFAULT_CONFIG
    expect(engineConfig.vm.maxStackDepth).toBe(200);
    expect(engineConfig.vm.maxInstructions).toBe(50000);
  });

  // ── Partial overrides (only one VM field mapped) ──────────────────────

  test("partial VM override: only maxInstructions via mapper, maxStackDepth uses default", () => {
    const settings = createMockSettings({ maxInstructions: 777 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    const engineConfig = engine.getConfig();
    expect(engineConfig.vm.maxStackDepth).toBe(200); // default
    expect(engineConfig.vm.maxInstructions).toBe(777); // overridden
  });

  test("partial VM override: only maxStackDepth via mapper, maxInstructions uses default", () => {
    const settings = createMockSettings({ maxStackDepth: 42 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    const engineConfig = engine.getConfig();
    expect(engineConfig.vm.maxStackDepth).toBe(42); // overridden
    expect(engineConfig.vm.maxInstructions).toBe(50000); // default
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  test("zero maxInstructions via mapper throws on any expression", () => {
    // With maxInstructions=0, even the first instruction exceeds the limit
    const settings = createMockSettings({ maxInstructions: 0 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // Any expression that generates at least 1 instruction will throw
    expect(() => engine.evaluateLine(1, "42")).toThrow(/maximum of 0 instructions/i);
  });

  test("zero maxStackDepth is present in config but does not restrict bytecode hot path", () => {
    const settings = createMockSettings({ maxStackDepth: 0, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // The mapped value is present in config
    expect(engine.getConfig().vm.maxStackDepth).toBe(0);

    // The hot path bypasses the push() bounds check, so even maxStackDepth=0
    // doesn't prevent expressions from evaluating correctly.
    expect(engine.evaluateLine(1, "42").toNumber()).toBe(42);
  });
});
