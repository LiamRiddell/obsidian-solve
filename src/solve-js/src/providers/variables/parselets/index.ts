export { VariableParselet } from "./VariableParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { VariableParselet } from "./VariableParselet";

export function registerVariableParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("COLON", new VariableParselet());
}
