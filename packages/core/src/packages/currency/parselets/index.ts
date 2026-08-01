export { CurrencySymbolParselet } from "./CurrencySymbolParselet";
export { InParselet } from "./InParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { CurrencySymbolParselet } from "./CurrencySymbolParselet";
import { InParselet } from "./InParselet";

export function registerCurrencyParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("DOLLAR", new CurrencySymbolParselet());
  registry.registerPrefix("POUND", new CurrencySymbolParselet());
  registry.registerPrefix("EURO", new CurrencySymbolParselet());
  registry.registerInfix("IN", new InParselet());
}
