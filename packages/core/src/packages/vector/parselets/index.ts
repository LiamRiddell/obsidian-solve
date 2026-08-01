export { VectorParselet } from "./VectorParselet";
export { FloatParselet } from "./FloatParselet";

import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { VectorParselet } from "./VectorParselet";
import { FloatParselet } from "./FloatParselet";

export function registerVectorParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("VEC2", new VectorParselet(2));
  registry.registerPrefix("VEC3", new VectorParselet(3));
  registry.registerPrefix("VEC4", new VectorParselet(4));
  registry.registerPrefix("FLOAT", new FloatParselet());
}
