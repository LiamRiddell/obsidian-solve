export { DiceRollParselet } from "./DiceRollParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { DiceRollParselet } from "./DiceRollParselet";

export function registerDiceParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("ROLL", new DiceRollParselet());
}
