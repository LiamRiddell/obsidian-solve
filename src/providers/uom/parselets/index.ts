export { UomLiteralParselet, isKnownUnit } from "./UomLiteralParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { UomLiteralParselet } from "./UomLiteralParselet";

export function registerUomParselets(registry: ParseletRegistry): void {
  registry.registerInfix("UNIT", new UomLiteralParselet());
}