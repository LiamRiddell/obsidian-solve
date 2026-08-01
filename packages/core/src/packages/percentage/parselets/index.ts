export { PercentParselet } from "./PercentParselet";
export { OfParselet } from "./OfParselet";
export { IncreaseDecreaseParselet } from "./IncreaseDecreaseParselet";
export { IncreaseByParselet } from "./IncreaseByParselet";
export { PercentageChangeParselet } from "./PercentageChangeParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { PercentParselet } from "./PercentParselet";
import { OfParselet } from "./OfParselet";
import { IncreaseDecreaseParselet } from "./IncreaseDecreaseParselet";
import { IncreaseByParselet } from "./IncreaseByParselet";
import { PercentageChangeParselet } from "./PercentageChangeParselet";

export function registerPercentageParselets(registry: ParseletRegistry): void {
  registry.registerInfix("PERCENT", new PercentParselet());
  registry.registerInfix("OF", new OfParselet());
  registry.registerPrefix("INCREASE", new IncreaseDecreaseParselet(1));
  registry.registerPrefix("DECREASE", new IncreaseDecreaseParselet(-1));
  registry.registerInfix("INCREASE_BY", new IncreaseByParselet(1));
  registry.registerInfix("DECREASE_BY", new IncreaseByParselet(-1));
  registry.registerInfix("TO", new PercentageChangeParselet());
}
