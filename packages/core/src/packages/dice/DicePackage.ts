import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { DiceRollParselet } from "./parselets/DiceRollParselet";

export const DICE_PACKAGE: IEnginePackage = {
  name: "solve-dice",
  prefixParselets: [
    { tokenType: "ROLL", parselet: new DiceRollParselet() },
  ],
};
