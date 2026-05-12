export { DiceRollParselet } from "./DiceRollParselet";
export { DiceRangeParselet } from "./DiceRangeParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { DiceRollParselet } from "./DiceRollParselet";
import { DiceRangeParselet } from "./DiceRangeParselet";

export function registerDiceParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("ROLL", new DiceRollParselet());
  registry.registerPrefix("BETWEEN", new DiceRangeParselet());
  registry.registerPrefix("FROM", new DiceRangeParselet());
}