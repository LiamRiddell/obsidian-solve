export { UomLiteralParselet, isKnownUnit } from "./UomLiteralParselet";
export { ConvertParselet } from "./ConvertParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { UomLiteralParselet } from "./UomLiteralParselet";
import { ConvertParselet } from "./ConvertParselet";

export function registerUomParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("CONVERT", new ConvertParselet());
  registry.registerInfix("UNIT", new UomLiteralParselet());
}
