export { NowParselet } from "./NowParselet";
export { DurationPostfixParselet } from "./DurationPostfixParselet";
export { NextLastParselet } from "./NextLastParselet";

import { ParseletRegistry } from "@/engine/parser/registry/ParseletRegistry";
import { NowParselet } from "./NowParselet";
import { DurationPostfixParselet } from "./DurationPostfixParselet";
import { NextLastParselet } from "./NextLastParselet";

const DURATION_TYPES = [
  "DURATION_SECOND", "DURATION_MINUTE", "DURATION_HOUR",
  "DURATION_DAY", "DURATION_WEEK", "DURATION_MONTH", "DURATION_YEAR",
];

export function registerDatetimeParselets(registry: ParseletRegistry): void {
  registry.registerPrefix("NOW", new NowParselet());
  registry.registerPrefix("TODAY", new NowParselet());
  registry.registerPrefix("TOMORROW", new NowParselet());
  registry.registerPrefix("YESTERDAY", new NowParselet());
  registry.registerPrefix("NEXT", new NextLastParselet(7));
  registry.registerPrefix("LAST", new NextLastParselet(-7));
  for (const t of DURATION_TYPES) {
    registry.registerInfix(t, new DurationPostfixParselet(t));
  }
}