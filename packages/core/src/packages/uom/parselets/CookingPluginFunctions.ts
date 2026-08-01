import { Value, ValueType, uomValue, errorValue } from "@solve-js/vm/Value";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { convertUnit, getMeasure } from "@solve-js/uom/UomConverter";
import { getIngredientDensity } from "../data/IngredientDensities";

/**
 * Cooking mass<->volume conversion — the density-aware plugin function
 * backing `CookingConversionParselet.ts`'s `<mass-or-volume> <substance>
 * in <target-unit>` grammar (e.g. "300g butter in cups", "10 cups olive
 * oil in grams", "100g nutella in tablespoons").
 *
 * Registered via `IEnginePackage.pluginFunctions` (collision-safe
 * allocator) rather than a coordinated `VMBuiltins.ts` CALL_BUILTIN index —
 * this conversion has no `functionName(args)` call-style form to support
 * (unlike Finance's `inflationAdjust`), so there's no need for
 * `FunctionCallParselet`'s coordinated index space at all.
 *
 * SCOPE DECISION: only ONE volume-unit convention is supported — whatever
 * the underlying `convert` npm package resolves for names like "cup"/
 * "tablespoon"/"teaspoon" (its own generated tables use US customary
 * definitions for these, e.g. 1 cup = 236.588 mL), matching SoulverCore's
 * own stated default. SoulverCore additionally lets a user pick US
 * Customary vs. Imperial vs. Metric cup/tablespoon/pint definitions as a
 * global preference — implementing that region-preference system is a
 * separate, larger feature and is NOT implemented here; an Imperial or
 * Metric-cup reading of "cup" is simply not available yet.
 */
export const COOKING_CONVERT_IDX = allocatePluginFunctionIndex();

/**
 * `amount` carries the source unit (e.g. Uom(300, "g")); `ingredientName`/
 * `targetUnitText` are the substance name (already lowercase, from the
 * fused `INGREDIENT_NAME` token) and the raw target-unit word typed after
 * "in" (e.g. "cups", "grams", "tablespoons" — NOT required to already be a
 * recognized lexer `UNIT` token; this handler passes it straight to the
 * `convert` package, which accepts full unit names directly).
 */
export function cookingConvertHandler(args: Value[]): Value {
  const amountValue = args[0];
  const ingredientName = args[1].value as string;
  const targetUnitText = args[2].value as string;

  if (amountValue.type !== ValueType.Uom || !amountValue.unit) {
    return errorValue(
      "COOKING_CONVERSION_REQUIRES_UNIT",
      `Expected a value with a mass or volume unit (e.g. "300g", "10 cups"), got a plain number`,
    );
  }
  const sourceUnit = amountValue.unit;
  const amount = amountValue.toNumber();

  const sourceMeasure = getMeasure(sourceUnit);
  const targetMeasure = getMeasure(targetUnitText);
  const isMassOrVolume = (m: string | undefined) => m === "mass" || m === "volume";

  if (!isMassOrVolume(sourceMeasure)) {
    return errorValue(
      "COOKING_CONVERSION_UNSUPPORTED_UNIT",
      `"${sourceUnit}" is not a recognized mass or volume unit`,
    );
  }
  if (!isMassOrVolume(targetMeasure)) {
    return errorValue(
      "COOKING_CONVERSION_UNSUPPORTED_UNIT",
      `"${targetUnitText}" is not a recognized mass or volume unit`,
    );
  }

  // Same-measure conversion (e.g. "300g butter in kg") — density plays no
  // part; just a normal unit conversion, same as the UoM package's "to"/"in".
  if (sourceMeasure === targetMeasure) {
    return uomValue(convertUnit(amount, sourceUnit, targetUnitText), targetUnitText);
  }

  const density = getIngredientDensity(ingredientName);
  if (density === undefined) {
    return errorValue(
      "COOKING_UNKNOWN_INGREDIENT",
      `No density data for "${ingredientName}" — cannot convert between mass and volume for this ingredient`,
    );
  }

  if (sourceMeasure === "mass") {
    const grams = convertUnit(amount, sourceUnit, "g");
    const mL = grams / density;
    const result = convertUnit(mL, "ml", targetUnitText);
    return uomValue(result, targetUnitText);
  }

  // volume -> mass
  const mL = convertUnit(amount, sourceUnit, "ml");
  const grams = mL * density;
  const result = convertUnit(grams, "g", targetUnitText);
  return uomValue(result, targetUnitText);
}
