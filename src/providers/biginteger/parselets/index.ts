export { BigIntNumberParselet } from "./BigIntNumberParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { BigIntNumberParselet } from "./BigIntNumberParselet";

export function registerBigIntParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("BIGINT", new BigIntNumberParselet());
}
