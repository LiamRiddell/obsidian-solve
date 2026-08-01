import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { PercentParselet } from "./parselets/PercentParselet";
import { OfParselet } from "./parselets/OfParselet";
import { IncreaseDecreaseParselet } from "./parselets/IncreaseDecreaseParselet";
import { PercentageChangeParselet } from "./parselets/PercentageChangeParselet";

export const PERCENTAGE_PACKAGE: IEnginePackage = {
  name: "solve-percentage",
  infixParselets: [
    { tokenType: "PERCENT", parselet: new PercentParselet() },
    { tokenType: "OF", parselet: new OfParselet() },
    { tokenType: "TO", parselet: new PercentageChangeParselet() },
  ],
  prefixParselets: [
    { tokenType: "INCREASE", parselet: new IncreaseDecreaseParselet(1) },
    { tokenType: "DECREASE", parselet: new IncreaseDecreaseParselet(-1) },
  ],
};
