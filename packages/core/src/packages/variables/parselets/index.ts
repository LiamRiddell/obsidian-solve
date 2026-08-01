export { VariableParselet } from "./VariableParselet";
export { IdentifierParselet } from "./IdentifierParselet";
export { GlobalVariableParselet } from "./GlobalVariableParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { VariableParselet } from "./VariableParselet";
import { IdentifierParselet } from "./IdentifierParselet";
import { GlobalVariableParselet } from "./GlobalVariableParselet";

export function registerVariableParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("COLON", new VariableParselet());
  registry.registerPrefix("IDENT", new IdentifierParselet());
  registry.registerPrefix("GLOBAL", new GlobalVariableParselet());
}
