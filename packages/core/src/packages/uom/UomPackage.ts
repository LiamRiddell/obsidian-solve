import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { UomLiteralParselet } from "./parselets/UomLiteralParselet";
import { ConvertParselet } from "./parselets/ConvertParselet";
import { PossibilitiesParselet } from "./parselets/PossibilitiesParselet";
import { uomPossibilitiesNormalizerRule } from "./normalizer/PossibilitiesNormalizerRule";
import { CookingConversionParselet } from "./parselets/CookingConversionParselet";
import { COOKING_CONVERT_IDX, cookingConvertHandler } from "./parselets/CookingPluginFunctions";
import { ingredientNameNormalizerRule } from "./normalizer/IngredientNameNormalizerRule";

/**
 * Units of measurement: `10 km`, `10 km to miles`, `convert 10 km to miles`,
 * `cm to ?` (conversion-possibilities query) — see {@link CURRENCY_PACKAGE}
 * for money, which is a separate package.
 *
 * Also cooking/baking mass<->volume conversion (e.g. "300g butter in
 * cups", "10 cups olive oil in grams") — see
 * `parselets/CookingConversionParselet.ts`,
 * `normalizer/IngredientNameNormalizerRule.ts`, and
 * `data/IngredientDensities.ts` (the bundled, clearly-labeled-approximate
 * ingredient-density table and its scope/accuracy doc comment) for the
 * full design, including why US Customary is the only volume-unit
 * convention supported so far.
 */
export const UOM_PACKAGE: IEnginePackage = {
  name: "solve-uom",
  prefixParselets: [
    { tokenType: "CONVERT", parselet: new ConvertParselet() },
    { tokenType: "UOM_POSSIBILITIES_QUERY", parselet: new PossibilitiesParselet() },
  ],
  infixParselets: [
    { tokenType: "UNIT", parselet: new UomLiteralParselet() },
    { tokenType: "INGREDIENT_NAME", parselet: new CookingConversionParselet() },
  ],
  normalizerRules: [
    uomPossibilitiesNormalizerRule(),
    ingredientNameNormalizerRule(),
  ],
  pluginFunctions: [
    { index: COOKING_CONVERT_IDX, handler: cookingConvertHandler },
  ],
};
