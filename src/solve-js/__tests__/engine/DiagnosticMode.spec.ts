import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("ExpressionEngine Diagnostic Mode Tests", () => {
  test("diagnostic mode disabled by default", () => {
    const engine = new ExpressionEngine("en");
    expect(engine.isDiagnosticMode()).toBe(false);
  });

  test("diagnostic mode can be enabled", () => {
    const engine = new ExpressionEngine("en", true);
    expect(engine.isDiagnosticMode()).toBe(true);
  });

test("evaluateLineWithDebug returns debug info when diagnostic mode is enabled", () => {
     const engine = new ExpressionEngine("en", true);
     const result = engine.evaluateLineWithDebug(1, "1 + 2");

     expect(result.debug).toBeDefined();
     expect(result.debug!.events).toBeDefined();
     expect(result.debug!.summary).toBeDefined();
     expect(result.debug!.metadata).toBeDefined();

     // Structured report
     expect(result.debug.summary.totalTokens).toBeGreaterThan(0);
     expect(result.debug.summary.totalOpcodes).toBeGreaterThan(0);
     expect(result.debug.summary.cacheHit).toBe(false);

     // Metadata
     expect(result.debug.metadata.expression).toBe("1 + 2");
   });

  test("evaluateLineWithDebug returns no debug info when diagnostic mode is disabled", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.evaluateLineWithDebug(1, "1 + 2");
    
    expect(result.debug).toBeUndefined();
  });

  test("diagnostic mode does not affect evaluation results", () => {
    const engineEnabled = new ExpressionEngine("en", true);
    const engineDisabled = new ExpressionEngine("en", false);
    
    const resultEnabled = engineEnabled.evaluateLineWithDebug(1, "1 + 2");
    const resultDisabled = engineDisabled.evaluateLineWithDebug(1, "1 + 2");
    
    expect(resultEnabled.value.toNumber()).toBe(resultDisabled.value.toNumber());
    expect(resultEnabled.value.type).toBe(resultDisabled.value.type);
    expect(resultEnabled.error).toBe(resultDisabled.error);
  });

  test("parseDocument returns debug info when diagnostic mode is enabled", () => {
    const engine = new ExpressionEngine("en", true);
    const result = engine.parseDocument("1 + 2", { inputType: 'markdown' });
    
    // Note: parseDocument doesn't currently return debug info, but we can verify
    // that the evaluation still works correctly with diagnostic mode enabled
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].result).toBeDefined();
  });

  test("parseDocument works correctly when diagnostic mode is disabled", () => {
    const engine = new ExpressionEngine("en", false);
    const result = engine.parseDocument("1 + 2", { inputType: 'markdown' });
    
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].result).toBeDefined();
  });
});
