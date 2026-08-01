import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { PercentParselet } from "./parselets/PercentParselet";
import { OfParselet } from "./parselets/OfParselet";
import { IncreaseDecreaseParselet } from "./parselets/IncreaseDecreaseParselet";
import { IncreaseByParselet } from "./parselets/IncreaseByParselet";
import { PercentageChangeParselet } from "./parselets/PercentageChangeParselet";

/**
 * Percentage syntax: `50%`, `50% of 200`, `100 to 150` (percentage change),
 * `increase 100 by 10%`/`decrease 100 by 10%` (prefix form), and the
 * `100 increase by 10%`/`100 decrease by 10%` infix form (fused from the
 * "increase by"/"decrease by" phrases by the built-in normalizer — see
 * BuiltinNormalizerRules.BUILTIN_PHRASES).
 */
export const PERCENTAGE_PACKAGE: IEnginePackage = {
  name: "solve-percentage",
  infixParselets: [
    { tokenType: "PERCENT", parselet: new PercentParselet() },
    { tokenType: "OF", parselet: new OfParselet() },
    { tokenType: "TO", parselet: new PercentageChangeParselet() },
    { tokenType: "INCREASE_BY", parselet: new IncreaseByParselet(1) },
    { tokenType: "DECREASE_BY", parselet: new IncreaseByParselet(-1) },
  ],
  prefixParselets: [
    { tokenType: "INCREASE", parselet: new IncreaseDecreaseParselet(1) },
    { tokenType: "DECREASE", parselet: new IncreaseDecreaseParselet(-1) },
  ],
};
