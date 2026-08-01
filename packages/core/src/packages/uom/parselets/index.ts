export { UomLiteralParselet, isKnownUnit } from "./UomLiteralParselet";
export { ConvertParselet } from "./ConvertParselet";
export { PossibilitiesParselet } from "./PossibilitiesParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { UomLiteralParselet } from "./UomLiteralParselet";
import { ConvertParselet } from "./ConvertParselet";
import { PossibilitiesParselet } from "./PossibilitiesParselet";

export function registerUomParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("CONVERT", new ConvertParselet());
  registry.registerInfix("UNIT", new UomLiteralParselet());
  registry.registerPrefix("UOM_POSSIBILITIES_QUERY", new PossibilitiesParselet());
}
