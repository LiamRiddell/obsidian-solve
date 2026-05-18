export { VariableParselet } from "./VariableParselet";
export { IdentifierParselet } from "./IdentifierParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { VariableParselet } from "./VariableParselet";
import { IdentifierParselet } from "./IdentifierParselet";

export function registerVariableParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("COLON", new VariableParselet());
  registry.registerPrefix("IDENT", new IdentifierParselet());
}
