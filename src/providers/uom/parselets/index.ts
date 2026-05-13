export { UomLiteralParselet, isKnownUnit } from "./UomLiteralParselet";
export { ConvertParselet } from "./ConvertParselet";
export { CurrencySymbolParselet } from "./CurrencySymbolParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { UomLiteralParselet } from "./UomLiteralParselet";
import { ConvertParselet } from "./ConvertParselet";
import { CurrencySymbolParselet } from "./CurrencySymbolParselet";

export function registerUomParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("CONVERT", new ConvertParselet());
  registry.registerInfix("UNIT", new UomLiteralParselet());
  registry.registerPrefix("DOLLAR", new CurrencySymbolParselet());
  registry.registerPrefix("POUND", new CurrencySymbolParselet());
  registry.registerPrefix("EURO", new CurrencySymbolParselet());
}
