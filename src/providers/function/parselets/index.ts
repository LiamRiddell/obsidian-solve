export { FunctionCallParselet } from "./FunctionCallParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { FunctionCallParselet } from "./FunctionCallParselet";

export function registerFunctionParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("FUNC", new FunctionCallParselet());
}