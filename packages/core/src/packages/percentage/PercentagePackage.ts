import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { PercentParselet } from "./parselets/PercentParselet";
import { OfParselet } from "./parselets/OfParselet";
import { OfWhatIsParselet } from "./parselets/OfWhatIsParselet";
import { OnOffWhatIsParselet } from "./parselets/OnOffWhatIsParselet";
import { IncreaseDecreaseParselet } from "./parselets/IncreaseDecreaseParselet";
import { IncreaseByParselet } from "./parselets/IncreaseByParselet";
import { PercentageChangeParselet } from "./parselets/PercentageChangeParselet";

/**
 * Percentage syntax: `50%`, `50% of 200`, `100 to 150` (percentage change),
 * `increase 100 by 10%`/`decrease 100 by 10%` (prefix form), the
 * `100 increase by 10%`/`100 decrease by 10%` infix form (fused from the
 * "increase by"/"decrease by" phrases by the built-in normalizer — see
 * BuiltinNormalizerRules.BUILTIN_PHRASES), and `5% of what is 6` (solve
 * for the base value — see OfWhatIsParselet.ts's doc comment). "of what
 * is" is phrase-fused (not a bare "what" keyword) for the same
 * variable-name-collision reason "total"/"average"/etc. are fused
 * elsewhere in this codebase — "what" is common enough to be worth
 * protecting as a `:variableName`.
 */
export const PERCENTAGE_PACKAGE: IEnginePackage = {
  name: "solve-percentage",
  phrases: {
    "of what is": "OF_WHAT_IS",
    "on what is": "ON_WHAT_IS",
    "off what is": "OFF_WHAT_IS",
  },
  infixParselets: [
    { tokenType: "PERCENT", parselet: new PercentParselet() },
    { tokenType: "OF", parselet: new OfParselet() },
    { tokenType: "OF_WHAT_IS", parselet: new OfWhatIsParselet() },
    { tokenType: "ON_WHAT_IS", parselet: new OnOffWhatIsParselet(1) },
    { tokenType: "OFF_WHAT_IS", parselet: new OnOffWhatIsParselet(-1) },
    { tokenType: "TO", parselet: new PercentageChangeParselet() },
    { tokenType: "INCREASE_BY", parselet: new IncreaseByParselet(1) },
    { tokenType: "DECREASE_BY", parselet: new IncreaseByParselet(-1) },
  ],
  prefixParselets: [
    { tokenType: "INCREASE", parselet: new IncreaseDecreaseParselet(1) },
    { tokenType: "DECREASE", parselet: new IncreaseDecreaseParselet(-1) },
  ],
};
