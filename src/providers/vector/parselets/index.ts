export { VectorParselet } from "./VectorParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { VectorParselet } from "./VectorParselet";

export function registerVectorParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("VEC2", new VectorParselet(2));
  registry.registerPrefix("VEC3", new VectorParselet(3));
  registry.registerPrefix("VEC4", new VectorParselet(4));
}