export { PercentParselet } from "./PercentParselet";
export { OfParselet } from "./OfParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { PercentParselet } from "./PercentParselet";
import { OfParselet } from "./OfParselet";

export function registerPercentageParselets(registry: ParseletRegistry): void {
  registry.registerInfix("PERCENT", new PercentParselet());
  registry.registerInfix("OF", new OfParselet());
}