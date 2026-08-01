/**
 * Percentage — real-engine wiring regression test.
 *
 * PERCENTAGE_PACKAGE (the actual `IEnginePackage` descriptor used by
 * `BUILTIN_PACKAGES` / the real `ExpressionEngine`) used to omit
 * `INCREASE_BY`/`DECREASE_BY` from its `infixParselets` — only the
 * test-only `registerPercentageParselets()` helper (used by
 * PercentageParselets.spec.ts) registered them. That meant "100 increase
 * by 10%" (the infix form, fused from the "increase by"/"decrease by"
 * phrases by the built-in normalizer) worked in every test but was
 * silently broken for real consumers of the engine — the parselet tests
 * were exercising a parallel registration path that the shipped package
 * never used.
 *
 * This test goes through the real, default-constructed ExpressionEngine
 * (BUILTIN_PACKAGES, the actual normalizer, the actual PERCENTAGE_PACKAGE)
 * specifically so a regression here can't hide behind the isolated
 * registry helper again.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("PERCENTAGE_PACKAGE — real engine wiring", () => {
  test("100 increase by 10% = 110 (infix form, via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("100 increase by 10%");
    expect(value.toNumber()).toBeCloseTo(110);
  });

  test("100 decrease by 10% = 90 (infix form, via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("100 decrease by 10%");
    expect(value.toNumber()).toBeCloseTo(90);
  });

  test("increase 100 by 10% = 110 (prefix form, via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("increase 100 by 10%");
    expect(value.toNumber()).toBeCloseTo(110);
  });

  test("decrease 100 by 10% = 90 (prefix form, via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("decrease 100 by 10%");
    expect(value.toNumber()).toBeCloseTo(90);
  });

  test("50% of 200 = 100 (via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("50% of 200");
    expect(value.toNumber()).toBe(100);
  });

  test("800 to 1000 = 25% increase (via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("800 to 1000");
    expect(value.toNumber()).toBeCloseTo(0.25, 10);
  });

  // "N% of what is X" — solve for the base value, the inverse of "N% of X".
  test("5% of what is 6 = 120 (solve-for-unknown form, via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("5% of what is 6");
    expect(value.toNumber()).toBeCloseTo(120);
  });

  test("50% of what is 100 = 200 (via the real engine)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("50% of what is 100");
    expect(value.toNumber()).toBeCloseTo(200);
  });

  // "N% on/off what is X" — solve for the base given a percentage
  // increase/decrease RESULT (Numpad's documented syntax reference).
  test("5% on what is 210 = 200 (base increased by 5% gives 210)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("5% on what is 210");
    expect(value.toNumber()).toBeCloseTo(200);
  });

  test("5% off what is 190 = 200 (base decreased by 5% gives 190)", () => {
    const engine = new ExpressionEngine("en");
    const [value] = engine.evaluateExpression("5% off what is 190");
    expect(value.toNumber()).toBeCloseTo(200);
  });

  // Regression guard: fusing "of what is" must not break "what" as a bare
  // :variableName, matching this codebase's established phrase-fusion
  // policy (see PercentagePackage.ts's doc comment).
  test(":what stays usable as a variable name", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":what = 42");
    const [value] = engine.evaluateExpression(":what + 1");
    expect(value.toNumber()).toBe(43);
  });
});
