import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "solve-engine/engine";
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
    expect(engine.evaluateLine(1, "10 + 20")[0].toNumber()).toBe(30);

    // A longer expression with many operations should also work
    expect(engine.evaluateLine(1, "1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10")[0].toNumber()).toBe(55);
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
  // executeBytecode()'s hot loop checks `stack.length > maxStackDepth`
  // once per instruction (see VM.ts) — this used to be dead code (the
  // bounds check only lived in the rarely-used VM.push() wrapper, never
  // called from the hot loop), but is now real enforcement. The following
  // tests verify both that the mapped value is present in
  // engine.getConfig() AND that it actually restricts bytecode execution.

  test("low maxStackDepth via mapper throws once an expression needs more than 1 stack slot", () => {
    const settings = createMockSettings({ maxStackDepth: 1, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // The mapped maxStackDepth=1 is present in config
    expect(engine.getConfig().vm.maxStackDepth).toBe(1);

    // "2 + 3" needs 2 stack slots at once (both operands pushed before
    // ADD reduces them to 1) — exceeds maxStackDepth=1.
    expect(() => engine.evaluateLine(1, "2 + 3")).toThrow(/maximum stack depth of 1/i);
    expect(() => engine.evaluateLine(1, "max(1, 2, 3)")).toThrow(/maximum stack depth of 1/i);
  });

  test("generous maxStackDepth via mapper allows complex expressions", () => {
    const settings = createMockSettings({ maxStackDepth: 10, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    expect(engine.evaluateLine(1, "max(1, 2, 3)")[0].toNumber()).toBe(3);
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

  test("zero maxStackDepth throws on a multi-instruction expression", () => {
    const settings = createMockSettings({ maxStackDepth: 0, maxInstructions: 100 });
    const config = EngineConfigMapper.toEngineConfig(settings);

    const engine = new ExpressionEngine("en", false, config);

    // The mapped value is present in config
    expect(engine.getConfig().vm.maxStackDepth).toBe(0);

    // The depth check runs once per instruction and catches stack growth
    // left over from the PREVIOUS instruction (a bounded one-instruction
    // delay, by design — see the comment above VM.ts's check). A single
    // bare literal like "42" compiles to exactly one opcode with nothing
    // after it, so the loop never runs a second iteration to notice the
    // resulting stack size — it can slip through even at maxStackDepth=0.
    // A multi-instruction expression like "1 + 1" cannot: the check fires
    // on the instruction that follows the pushes.
    expect(() => engine.evaluateLine(1, "1 + 1")).toThrow(/maximum stack depth of 0/i);
  });
});
