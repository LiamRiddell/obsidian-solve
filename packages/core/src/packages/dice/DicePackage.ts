import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { DiceRollParselet } from "./parselets/DiceRollParselet";

/** `roll(min, max)` — returns a random integer in the inclusive `[min, max]` range. */
export const DICE_PACKAGE: IEnginePackage = {
  name: "solve-dice",
  prefixParselets: [
    { tokenType: "ROLL", parselet: new DiceRollParselet() },
  ],
};
