export { VectorParselet } from "./VectorParselet";
export { VectorAddParselet, VectorSubParselet, VectorDotParselet } from "./VectorOpParselets";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { VectorParselet } from "./VectorParselet";
import { VectorAddParselet, VectorSubParselet, VectorDotParselet } from "./VectorOpParselets";

export function registerVectorParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("LBRACKET", new VectorParselet());
  registry.registerInfix("VEC_ADD", new VectorAddParselet());
  registry.registerInfix("VEC_SUB", new VectorSubParselet());
  registry.registerInfix("VEC_DOT", new VectorDotParselet());
}