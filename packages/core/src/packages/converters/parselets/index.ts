export { AsConverterParselet } from "./AsConverterParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { AsConverterParselet } from "./AsConverterParselet";

export function registerConvertersParselets(registry: ParseletRegistry): void {
  registry.registerInfix("AS", new AsConverterParselet());
}
