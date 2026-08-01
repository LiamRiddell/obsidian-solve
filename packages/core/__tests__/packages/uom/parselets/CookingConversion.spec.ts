/**
 * Cooking & volume calculations (extends packages/uom/) — density-aware
 * mass<->volume conversion for a named ingredient, e.g. "300g butter in
 * cups", "10 cups olive oil in grams", "100g nutella in tablespoons".
 *
 * Expected numeric results are computed dynamically from the SAME
 * `getIngredientDensity`/`convertUnit` the implementation uses, rather
 * than hardcoded numbers — this keeps the test self-consistent with
 * whatever density value/`convert`-package conversion factor is actually
 * in effect, rather than baking in a second, possibly-drifting copy of
 * the same arithmetic. See FinanceParselets.spec.ts / InflationParselets
 * .spec.ts for the established `evalReal()` real-engine pattern.
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";
import { ValueType } from "@solve-js/vm/Value";
import { getIngredientDensity } from "@solve-js/packages/uom/data/IngredientDensities";
import { convertUnit } from "@solve-js/uom/UomConverter";

function evalReal(expr: string) {
  const engine = new ExpressionEngine("en");
  const [value] = engine.evaluateExpression(expr);
  return value;
}

describe("<mass> <substance> in <volume-unit> -- mass to volume (real engine)", () => {
  test("300g butter in cups", () => {
    const density = getIngredientDensity("butter")!;
    const expectedMl = 300 / density;
    const expected = convertUnit(expectedMl, "ml", "cups");
    const value = evalReal("300g butter in cups");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(expected, 4);
    // Sanity-check against the task's own worked example (~1.32 cup).
    expect(value.toNumber()).toBeCloseTo(1.32, 1);
  });

  test("100g nutella in tablespoons", () => {
    const density = getIngredientDensity("nutella")!;
    const expectedMl = 100 / density;
    const expected = convertUnit(expectedMl, "ml", "tablespoons");
    expect(evalReal("100g nutella in tablespoons").toNumber()).toBeCloseTo(expected, 4);
  });
});

describe("<volume> <substance> in <mass-unit> -- volume to mass, reverse direction (real engine)", () => {
  test("10 cups olive oil in grams", () => {
    const density = getIngredientDensity("olive oil")!;
    const cupsInMl = convertUnit(10, "cups", "ml");
    const expected = cupsInMl * density;
    const value = evalReal("10 cups olive oil in grams");
    expect(value.type).toBe(ValueType.Uom);
    expect(value.toNumber()).toBeCloseTo(expected, 2);
    // Sanity-check against the task's own worked example (~2,160 g).
    expect(value.toNumber()).toBeCloseTo(2160, 0);
  });
});

describe("cross-unit-type conversions for the same substance (real engine)", () => {
  test("2 tbsp olive oil in ml -- a smaller volume-to-volume-adjacent case still resolves via density when asked for a mass unit", () => {
    const density = getIngredientDensity("olive oil")!;
    const tbspInMl = convertUnit(2, "tbsp", "ml");
    const expectedGrams = tbspInMl * density;
    expect(evalReal("2 tbsp olive oil in grams").toNumber()).toBeCloseTo(expectedGrams, 3);
  });

  test("same-measure conversion (mass to mass) ignores density entirely: 300g butter in kg -> 0.3", () => {
    expect(evalReal("300g butter in kg").toNumber()).toBeCloseTo(0.3, 6);
  });
});

describe("errors and edge cases", () => {
  test("unknown ingredient produces an Error value, not a silently wrong number", () => {
    const value = evalReal("100g unobtainium in cups");
    expect(value.type).toBe(ValueType.Error);
  });

  test("regression guard: ordinary unit conversion is unaffected — 300 g in kg (no ingredient word) still works via the normal UoM path", () => {
    expect(evalReal("300 g in kg").toNumber()).toBeCloseTo(0.3, 6);
  });

  test("regression guard: 5 km to miles (ordinary UoM conversion, untouched by the cooking package)", () => {
    expect(evalReal("5 km to miles").toNumber()).toBeCloseTo(3.10686, 3);
  });
});

describe("UOM_PACKAGE cooking conversion — regression guards (bare variable names must still work)", () => {
  test("':butter', ':sugar', ':flour', ':milk' all still work as variable names -- the ingredient-name fusion only fires immediately after a real UNIT token AND immediately before \"in <unit>\", so a bare colon-prefixed variable definition is never intercepted", () => {
    const engine = new ExpressionEngine("en");
    engine.evaluateExpression(":butter = 1");
    engine.evaluateExpression(":sugar = 2");
    engine.evaluateExpression(":flour = 3");
    engine.evaluateExpression(":milk = 4");
    const [value] = engine.evaluateExpression(":butter + :sugar + :flour + :milk");
    expect(value.toNumber()).toBe(10);
  });

  test("regression guard: ordinary arithmetic elsewhere is unaffected by the new normalizer rule", () => {
    expect(evalReal("(2 + 3) * 4").toNumber()).toBe(20);
  });
});
