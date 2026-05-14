export { NowParselet } from "./NowParselet";
export { NextLastParselet } from "./NextLastParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { NowParselet } from "./NowParselet";
import { NextLastParselet } from "./NextLastParselet";

export function registerDatetimeParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("NOW", new NowParselet());
  registry.registerPrefix("TODAY", new NowParselet());
  registry.registerPrefix("TOMORROW", new NowParselet());
  registry.registerPrefix("YESTERDAY", new NowParselet());
  registry.registerPrefix("NEXT", new NextLastParselet(7));
  registry.registerPrefix("LAST", new NextLastParselet(-7));
}